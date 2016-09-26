import { resolve as resolvePath } from 'path'
import { parse as parseQueryString } from 'querystring'
import { IncomingMessage, ServerResponse } from 'http'
const httpError = require('http-errors')
const parseUrl = require('parseurl')
const finalHandler = require('finalhandler')
const bodyParser = require('body-parser')
import {
  Source,
  parse as parseGraphql,
  validate as validateGraphql,
  execute as executeGraphql,
  getOperationAST,
  formatError,
} from 'graphql'
import { Inventory } from '../../interface'
import createGraphqlSchema from '../schema/createGraphqlSchema'

// TODO: test `express`
// TODO: test `connect`
// TODO: test `koa`
// TODO: test `http`
/**
 * Creates a GraphQL request handler, this is untyped besides some JSDoc types
 * for intellisense.
 *
 * @param {Inventory} inventory
 */
export default function createGraphqlHTTPRequestHandler (inventory, options = {}) {
  // Creates our GraphQL schema…
  const graphqlSchema = createGraphqlSchema(inventory, options)

  // Define a list of middlewares that will get run before our request handler.
  // Note though that none of these middlewares will intercept a request (i.e.
  // not call `next`). Middlewares that handle a request like favicon
  // middleware will result in a promise that never resolves, and we don’t
  // want that.
  const middlewares = [
    // Parse JSON bodies.
    bodyParser.json(),
    // Parse URL encoded bodies (forms).
    bodyParser.urlencoded({ extended: false }),
    // Parse `application/graphql` content type bodies as text.
    bodyParser.text({ type: 'application/graphql' }),
  ]

  /**
   * The actual request handler. It’s an async function so it will return a
   * promise when complete. If the function doesn’t handle anything, it calls
   * `next` to let the next middleware try and handle it.
   *
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   */
  const requestHandler = async (req, res, next) => {
    // Don’t handle any requests if this is not the correct route.
    if (parseUrl(req).pathname !== (options.route || '/'))
      return next()

    // If we didn’t call `next` above, all requests will return 200 by default!
    res.statusCode = 200

    // Add our CORS headers to be good web citizens (there are perf
    // implications though so be careful!)
    addCORSHeaders(res)

    // Don’t execute our GraphQL stuffs for `OPTIONS` requests.
    if (req.method === 'OPTIONS') {
      res.statusCode = 200
      res.end()
      return
    }

    // The `result` will be used at the very end in our `finally` block.
    // Statements inside the `try` will assign to `result` when they get
    // a result.
    let result

    // This big `try`/`catch`/`finally` block represents the execution of our
    // GraphQL query. All errors thrown in this block will be returned to the
    // client as GraphQL errors.
    try {
      // Run all of our middleware by converting them into promises and
      // chaining them together. Remember that if we have a middleware that
      // never calls `next`, we will have a promise that never resolves! Avoid
      // those middlewares.
      //
      // Note that we also run our middleware after we make sure we are on the
      // correct route. This is so that if our middleware modifies the `req` or
      // `res` objects, only we downstream will see the modifications.
      //
      // We also run our middleware inside the `try` so that we get the GraphQL
      // error reporting style for syntax errors.
      await middlewares.reduce((promise, middleware) => (
        promise.then(() => new Promise((resolve, reject) => {
          middleware(req, res, error => {
            if (error) reject(error)
            else resolve()
          })
        }))
      ), Promise.resolve())

      // If this is not one of the correct methods, throw an error.
      if (!(req.method === 'GET' || req.method === 'POST')) {
        res.setHeader('Allow', 'GET, POST')
        throw httpError(405, 'Only `GET` and `POST` requests are allowed.')
      }

      // Get the parameters we will use to run a GraphQL request. `params` may
      // include:
      //
      // - `query`: The required GraphQL query string.
      // - `variables`: An optional JSON object containing GraphQL variables.
      // - `operationName`: The optional name of the GraphQL operation we will
      //   be executing.
      const params =
        req.method === 'GET'
          ? parseQueryString(parseUrl(req).query)
          : typeof req.body === 'string' ? { query: req.body } : req.body

      // Throw an error if no query string was defined.
      if (!params.query)
        throw httpError(400, 'Must provide a query string.')

      // If variables is a string, we assume it is a JSON string and that it
      // needs to be parsed.
      if (typeof params.variables === 'string') {
        try {
          params.variables = JSON.parse(params.variables)
        }
        catch (error) {
          error.statusCode = 400
          throw error
        }
      }

      const source = new Source(params.query, 'GraphQL HTTP Request')
      let queryDocumentAST

      // Catch an errors while parsing so that we can set the `statusCode` to
      // 400. Otherwise we don’t need to parse this way.
      try {
        queryDocumentAST = parseGraphql(source)
      }
      catch (error) {
        res.statusCode = 400
        throw error
      }

      // Validate our GraphQL query using given rules.
      // TODO: Add a complexity GraphQL rule.
      const validationErrors = validateGraphql(graphqlSchema, queryDocumentAST)

      // If we have some validation errors, don’t execute the query. Instead
      // send the errors to the client with a `400` code.
      if (validationErrors.length > 0) {
        res.statusCode = 400
        result = { errors: validationErrors }
        return
      }

      // If this is a `GET` request, we need to make sure that we are not
      // allowing mutations. Only standard GraphQL queries can be performed
      // in a `GET` request.
      if (req.method === 'GET') {
        const operationAST = getOperationAST(queryDocumentAST, params.operationName)

        if (operationAST.operation !== 'query') {
          res.setHeader('Allow', 'Post')
          throw httpError(405, `Can only perform a '${operationAST.operation}' operation from a POST request.`)
        }
      }

      // Create a new context
      const context = await inventory.createContext()

      try {
        result = await executeGraphql(
          graphqlSchema,
          queryDocumentAST,
          null,
          context,
          params.variables,
          params.operationName,
        )
      }
      // Cleanup our context. Even if we fail to execute the request it is
      // very important that we cleanup after ourselves!
      finally {
        await context.cleanup()
      }
    }
    catch (error) {
      // Set our status code and send the client our results!
      if (res.statusCode === 200) res.statusCode = error.status || 500
      result = { errors: [error] }

      // If the status code is 500, let’s log our error.
      if (res.statusCode === 500)
        console.error(error.stack)
    }
    // Finally, we send the client the contents of `result`.
    finally {
      // Format our errors so the client doesn’t get the full thing.
      if (result && result.errors)
        result.errors = result.errors.map(formatError)

      // Send our result to the client as JSON.
      res.setHeader('Content-Type', 'application/json; charser=utf-8')
      res.end(JSON.stringify(result))
    }
  }

  /**
   * A polymorphic request handler that should detect what `http` framework is
   * being used and specifically handle that framework.
   *
   * Supported frameworks include:
   *
   * - Native Node.js `http`.
   * - `connect`.
   * - `express`.
   * - `koa` (2.0).
   */
  return (a, b, c) => {
    // If are arguments look like the arguments to koa middleware, this is
    // `koa` middleware.
    if (a.req && a.res && typeof b === 'function') {
      // Set the correct `koa` variable names…
      const ctx = a
      const next = b

      // Execute our request handler. If an error is thrown, we don’t call
      // `next` with an error. Instead we return the promise and let `koa`
      // handle the error.
      return requestHandler(ctx.req, ctx.res, next)
    }
    else {
      // Set the correct `connect` style variable names. If there was no `next`
      // defined (likely the case if the client is using `http`) we use the
      // final handler.
      const req = a
      const res = b
      const next = c || finalHandler(req, res)

      // Execute our request handler.
      requestHandler(req, res, next).then(
        // If the request was fulfilled, noop.
        () => {},
        // If the request errored out, call `next` with the error.
        error => next(error)
      )
    }
  }
}

/**
 * Adds CORS to a request. See [this][1] flowchart for an explanation of how
 * CORS works. Note that these headers are set for all requests, CORS
 * algorithms normally run a preflight request using the `OPTIONS` method to
 * get these headers.
 *
 * Note though, that enabling CORS will incur extra costs when it comes to the
 * preflight requests. It is much better if you choose to use a proxy and
 * bypass CORS altogether.
 *
 * [1]: http://www.html5rocks.com/static/images/cors_server_flowchart.png
 */
function addCORSHeaders (res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Request-Method', 'GET, POST')
  res.setHeader('Access-Control-Allow-Headers', [
    'Origin',
    'X-Requested-With',
    // Used by `express-graphql` to determine whether to expose the GraphiQL
    // interface (`text/html`) or not.
    'Accept',
    // Used by PostGraphQL for auth purposes.
    'Authorization',
    // The `Content-*` headers are used when making requests with a body,
    // like in a POST request.
    'Content-Type',
    'Content-Length',
  ].join(', '))
}
