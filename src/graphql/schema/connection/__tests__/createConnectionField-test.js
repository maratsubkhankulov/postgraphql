jest.mock('../../getType')
jest.mock('../../../../interface')

import { Kind, GraphQLObjectType, GraphQLInterfaceType, GraphQLList, GraphQLString } from 'graphql'
import { Context, Paginator } from '../../../../interface'
import getType from '../../getType'
import createConnectionField, { _cursorType, _pageInfoType, _createEdgeType, _createOrderByEnumType, _createConnectionType } from '../createConnectionField'

const expectPromiseToReject = (promise, matcher) => new Promise((resolve, reject) =>
  promise
    .then(() => reject(new Error('Expected promise to reject.')))
    .catch(error => {
      expect(() => { throw error }).toThrowError(matcher)
      resolve()
    })
)

test('_cursorType will correctly serialize namespaced cursors', () => {
  expect(_cursorType.serialize({
    orderingName: 'world',
    cursor: 'foobar',
  })).toBe('WyJ3b3JsZCIsImZvb2JhciJd')
})

test('_cursorType will correctly parse values', () => {
  expect(_cursorType.parseValue('WyJ3b3JsZCIsImZvb2JhciJd')).toEqual({
    orderingName: 'world',
    cursor: 'foobar',
  })
})

test('_cursorType will correctly parse literals', () => {
  expect(_cursorType.parseLiteral({
    kind: Kind.STRING,
    value: 'WyJ3b3JsZCIsImZvb2JhciJd',
  })).toEqual({
    orderingName: 'world',
    cursor: 'foobar',
  })
  expect(_cursorType.parseLiteral({ kind: Kind.INT })).toBe(null)
  expect(_cursorType.parseLiteral({ kind: Kind.FLOAT })).toBe(null)
  expect(_cursorType.parseLiteral({ kind: Kind.ENUM })).toBe(null)
  expect(_cursorType.parseLiteral({ kind: Kind.OBJECT })).toBe(null)
})

test('_pageInfoType will get hasNextPage correctly', () => {
  const hasNext = Symbol('hasNext')
  expect(_pageInfoType.getFields().hasNextPage.resolve({ page: { hasNextPage: () => hasNext } })).toBe(hasNext)
})

test('_pageInfoType will get hasPreviousPage correctly', () => {
  const hasPrevious = Symbol('hasPrevious')
  expect(_pageInfoType.getFields().hasPreviousPage.resolve({ page: { hasPreviousPage: () => hasPrevious } })).toBe(hasPrevious)
})

test('_pageInfoType will get the correct start cursor', () => {
  const paginatorName = Symbol('paginatorName')
  const orderingName = Symbol('orderingName')
  const startCursor = Symbol('startCursor')
  const endCursor = Symbol('endCursor')

  expect(_pageInfoType.getFields().startCursor.resolve({
    paginator: { name: paginatorName },
    ordering: { name: orderingName },
    page: { values: [{ cursor: startCursor }, { cursor: endCursor }] },
  })).toEqual({
    orderingName,
    cursor: startCursor,
  })
})

test('_pageInfoType will get the correct end cursor', () => {
  const paginatorName = Symbol('paginatorName')
  const orderingName = Symbol('orderingName')
  const startCursor = Symbol('startCursor')
  const endCursor = Symbol('endCursor')

  expect(_pageInfoType.getFields().endCursor.resolve({
    paginator: { name: paginatorName },
    ordering: { name: orderingName },
    page: { values: [{ cursor: startCursor }, { cursor: endCursor }] },
  })).toEqual({
    orderingName,
    cursor: endCursor,
  })
})

test('_createEdgeType will create an object type', () => {
  const edgeType = _createEdgeType({}, {})
  expect(edgeType instanceof GraphQLObjectType).toBe(true)
})

test('_createEdgeType will have the correct name', () => {
  const edgeType = _createEdgeType({}, { name: 'foo' })
  expect(edgeType.name).toBe('FooEdge')
})

test('_createEdgeType will correctly return a namespaced cursor', () => {
  getType.mockReturnValueOnce(GraphQLString)
  const paginator = { name: 'foo' }
  const edgeType = _createEdgeType({}, paginator)
  expect(edgeType.getFields().cursor.resolve({ paginator, cursor: 'foobar' }))
    .toEqual({
      orderingName: null,
      cursor: 'foobar',
    })
  expect(edgeType.getFields().cursor.resolve({ paginator, cursor: 'xyz', ordering: { name: 'bar' } }))
    .toEqual({
      orderingName: 'bar',
      cursor: 'xyz',
    })
})

test('_createEdgeType will just return the value for the node field', () => {
  getType.mockReturnValueOnce(GraphQLString)
  const value = Symbol('value')
  const edgeType = _createEdgeType({}, {})
  expect(edgeType.getFields().node.resolve({ value })).toBe(value)
})

test('_createOrderByEnumType will create an enum type with all the paginator orderings', () => {
  const a = Symbol('a')
  const b = Symbol('b')
  const orderings = [{ name: 'a', a }, { name: 'b', b }]
  const paginator = { name: 'bar', orderings }
  const enumType = _createOrderByEnumType({}, paginator)

  expect(enumType.name).toBe('BarOrderBy')
  expect(enumType.getValues()).toEqual([{
    name: 'A',
    value: Array.from(orderings)[0],
    description: undefined,
    deprecationReason: undefined,
  }, {
    name: 'B',
    value: Array.from(orderings)[1],
    description: undefined,
    deprecationReason: undefined,
  }])
})

test('_createConnectionType will have the right name', () => {
  const connectionType = _createConnectionType({}, { name: 'bar' })
  expect(connectionType.name).toBe('BarConnection')
})

test('_createConnectionType will resolve the source verbatim for pageInfo', () => {
  const source = Symbol('source')
  getType.mockReturnValueOnce(GraphQLString)
  const connectionType = _createConnectionType({}, {})
  expect(connectionType.getFields().pageInfo.resolve(source)).toBe(source)
})

test('_createConnectionType will use the paginators count method for totalCount', () => {
  const count = Symbol('count')
  const args = Symbol('args')
  const context = new Context()
  const condition = Symbol('condition')

  const paginator = { count: jest.fn(() => count) }

  getType.mockReturnValueOnce(GraphQLString)
  const connectionType = _createConnectionType({}, paginator)

  expect(connectionType.getFields().totalCount.resolve({ paginator, condition }, args, context)).toBe(count)
  expect(paginator.count.mock.calls).toEqual([[context, condition]])
})

test('_createConnectionType will get the edges from the source page with some extra info', () => {
  const paginator = Symbol('paginator')
  const ordering = Symbol('ordering')
  const values = [{ value: 'a', cursor: 1 }, { value: 'b', cursor: 2 }]

  getType.mockReturnValueOnce(GraphQLString)
  const connectionType = _createConnectionType({}, {})

  expect(connectionType.getFields().edges.resolve({ paginator, ordering, page: { values } }, {}, new Context()))
    .toEqual([{ value: 'a', cursor: 1, paginator, ordering }, { value: 'b', cursor: 2, paginator, ordering }])
})

test('_createConnectionType will map the nodes field to page values', () => {
  const value1 = Symbol('value1')
  const value2 = Symbol('value2')
  getType.mockReturnValueOnce(GraphQLString)
  const connectionType = _createConnectionType({}, {})
  expect(connectionType.getFields().nodes.resolve({ page: { values: [{ value: value1 }, { value: value2 }] } }, {}, new Context()))
    .toEqual([value1, value2])
})

test('createConnectionField will only include a condition argument if a condition config was included', () => {
  const paginator = {}
  expect(createConnectionField({}, paginator).args.condition).toBeFalsy()
  expect(createConnectionField({}, paginator, { conditionType: GraphQLString }).args.condition).toBeTruthy()
})

test('createConnectionField will throw when trying to resolve with cursors from different orderings', async () => {
  const paginator = { name: 'foo' }
  const field = createConnectionField({}, paginator)
  await expectPromiseToReject(field.resolve(null, { orderBy: { name: 'buz' }, before: { paginatorName: 'foo', orderingName: null } }, new Context()), '`before` cursor can not be used for this `orderBy` value.')
  await expectPromiseToReject(field.resolve(null, { orderBy: { name: 'buz' }, after: { paginatorName: 'foo', orderingName: null } }, new Context()), '`after` cursor can not be used for this `orderBy` value.')
  await expectPromiseToReject(field.resolve(null, { orderBy: { name: 'buz' }, before: { paginatorName: 'foo', orderingName: 'bar' } }, new Context()), '`before` cursor can not be used for this `orderBy` value.')
  await expectPromiseToReject(field.resolve(null, { orderBy: { name: 'buz' }, after: { paginatorName: 'foo', orderingName: 'bar' } }, new Context()), '`after` cursor can not be used for this `orderBy` value.')
  await expectPromiseToReject(field.resolve(null, { orderBy: null, before: { paginatorName: 'foo', orderingName: 'buz' } }, new Context()), '`before` cursor can not be used for this `orderBy` value.')
  await expectPromiseToReject(field.resolve(null, { orderBy: null, after: { paginatorName: 'foo', orderingName: 'buz' } }, new Context()), '`after` cursor can not be used for this `orderBy` value.')
})

test('createConnectionField resolver will call Paginator#readPage and return the resulting page with some other values', async () => {
  const context = new Context()
  const page = Symbol('page')

  const paginator = { name: 'foo', readPage: jest.fn(() => page) }

  const field = createConnectionField({}, paginator)

  expect(await field.resolve(null, {}, context)).toEqual({
    paginator,
    ordering: undefined,
    condition: true,
    page,
  })

  expect(paginator.readPage.mock.calls).toEqual([[context, { condition: true }]])
})

test('createConnectionField resolver will have a condition other than true if a config is provided', async () => {
  const context = new Context()
  const source = Symbol('source')
  const conditionArg = Symbol('conditionArg')
  const condition = Symbol('condition')

  const paginator = { name: 'foo', readPage: jest.fn() }

  const getCondition = jest.fn(() => condition)

  const field = createConnectionField({}, paginator, {
    conditionType: GraphQLString,
    getCondition,
  })

  expect((await field.resolve(source, { condition: conditionArg }, context)).condition).toBe(condition)
  expect(paginator.readPage.mock.calls).toEqual([[context, { condition }]])
  expect(getCondition.mock.calls).toEqual([[source, conditionArg]])
})

test('createConnectionField will pass down valid cursors without orderings', async () => {
  const context = new Context()
  const cursor1 = Symbol('cursor1')
  const cursor2 = Symbol('cursor2')

  const beforeCursor = { paginatorName: 'foo', orderingName: null, cursor: cursor1 }
  const afterCursor = { paginatorName: 'foo', orderingName: null, cursor: cursor2 }

  const paginator = { name: 'foo', readPage: jest.fn() }

  await createConnectionField({}, paginator).resolve(null, { before: beforeCursor }, context)
  await createConnectionField({}, paginator).resolve(null, { after: afterCursor }, context)

  expect(paginator.readPage.mock.calls).toEqual([
    [context, { beforeCursor: cursor1, condition: true }],
    [context, { afterCursor: cursor2, condition: true }],
  ])
})

test('createConnectionField will pass down first/last integers', async () => {
  const context = new Context()
  const first = Symbol('first')
  const last = Symbol('last')

  const paginator = { name: 'foo', readPage: jest.fn() }

  await createConnectionField({}, paginator).resolve(null, { first }, context)
  await createConnectionField({}, paginator).resolve(null, { last }, context)

  expect(paginator.readPage.mock.calls).toEqual([
    [context, { first, condition: true }],
    [context, { last, condition: true }],
  ])
})
