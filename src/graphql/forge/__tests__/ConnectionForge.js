import test from 'ava'
import { Kind, GraphQLObjectType, GraphQLInterfaceType, GraphQLNonNull, GraphQLList, GraphQLID } from 'graphql'
import ConnectionForge from '../ConnectionForge'

const mockNodeInterfaceType = new GraphQLInterfaceType({
    name: 'Node',
    fields: { __id: { type: new GraphQLNonNull(GraphQLID) } },
  })

const mockTypeForge = () => ({
  getOutputType: value => value,
})

const mockGQLType = (name = 'Paginator') => new GraphQLObjectType({
  name,
  isTypeOf: () => true,
  interfaces: [mockNodeInterfaceType],
  fields: { __id: { type: new GraphQLNonNull(GraphQLID), resolve: () => '__id' } },
})

const mockPaginator = ({
  name = 'paginator',
  gqlType = mockGQLType(),
  orderings = [{ name: 'up' }, { name: 'down' }],
  defaultOrdering = orderings[0],
  readPage = () => {},
} = {}) => ({
  getName: () => name,
  getType: () => gqlType,
  getOrderings: () => orderings,
  getDefaultOrdering: () => defaultOrdering,
  readPage,
})

test('_cursorType will correctly serialize namespaced cursors', t => {
  t.is(ConnectionForge._cursorType.serialize({
    paginatorName: 'hello',
    orderingName: 'world',
    cursor: 'foobar',
  }), 'WyJoZWxsbyIsIndvcmxkIiwiZm9vYmFyIl0=')
})

test('_cursorType will correctly parse values', t => {
  t.deepEqual(ConnectionForge._cursorType.parseValue('WyJoZWxsbyIsIndvcmxkIiwiZm9vYmFyIl0='), {
    paginatorName: 'hello',
    orderingName: 'world',
    cursor: 'foobar',
  })
})

test('_cursorType will correctly parse literals', t => {
  t.deepEqual(ConnectionForge._cursorType.parseLiteral({
    kind: Kind.STRING,
    value: 'WyJoZWxsbyIsIndvcmxkIiwiZm9vYmFyIl0=',
  }), {
    paginatorName: 'hello',
    orderingName: 'world',
    cursor: 'foobar',
  })
  t.is(ConnectionForge._cursorType.parseLiteral({ kind: Kind.INT }), null)
  t.is(ConnectionForge._cursorType.parseLiteral({ kind: Kind.FLOAT }), null)
  t.is(ConnectionForge._cursorType.parseLiteral({ kind: Kind.ENUM }), null)
  t.is(ConnectionForge._cursorType.parseLiteral({ kind: Kind.OBJECT }), null)
})

test('_pageInfoType will get hasNextPage correctly', t => {
  const hasNext = Symbol('hasNext')
  t.is(ConnectionForge._pageInfoType.getFields().hasNextPage.resolve({ page: { hasNext } }), hasNext)
})

test('_pageInfoType will get hasPreviousPage correctly', t => {
  const hasPrevious = Symbol('hasPrevious')
  t.is(ConnectionForge._pageInfoType.getFields().hasPreviousPage.resolve({ page: { hasPrevious } }), hasPrevious)
})

test('_pageInfoType will get the correct start cursor', t => {
  const paginatorName = Symbol('paginatorName')
  const orderingName = Symbol('orderingName')
  const startCursor = Symbol('startCursor')
  const endCursor = Symbol('endCursor')

  t.deepEqual(ConnectionForge._pageInfoType.getFields().startCursor.resolve({
    paginator: { getName: () => paginatorName },
    ordering: { name: orderingName },
    page: { values: [{ cursor: startCursor }, { cursor: endCursor }] },
  }), {
    paginatorName,
    orderingName,
    cursor: startCursor,
  })
})

test('_pageInfoType will get the correct end cursor', t => {
  const paginatorName = Symbol('paginatorName')
  const orderingName = Symbol('orderingName')
  const startCursor = Symbol('startCursor')
  const endCursor = Symbol('endCursor')

  t.deepEqual(ConnectionForge._pageInfoType.getFields().endCursor.resolve({
    paginator: { getName: () => paginatorName },
    ordering: { name: orderingName },
    page: { values: [{ cursor: startCursor }, { cursor: endCursor }] },
  }), {
    paginatorName,
    orderingName,
    cursor: endCursor,
  })
})

test('_getEdgeType will create an object type', t => {
  const connectionForge = new ConnectionForge(mockTypeForge())
  const edgeType = connectionForge._getEdgeType(mockPaginator())
  t.true(edgeType instanceof GraphQLObjectType)
})

test('_getEdgeType will have the correct name', t => {
  const connectionForge = new ConnectionForge(mockTypeForge())
  const edgeType = connectionForge._getEdgeType(mockPaginator({ name: 'foo', gqlType: mockGQLType('bar') }))
  t.is(edgeType.name, 'FooEdge')
})

test('_getEdgeType implements the correct is type of check', t => {
  const paginator1 = mockPaginator()
  const paginator2 = mockPaginator()
  const connectionForge = new ConnectionForge(mockTypeForge())
  const edgeType = connectionForge._getEdgeType(paginator1, mockGQLType())
  t.true(edgeType.isTypeOf({ paginator: paginator1 }))
  t.false(edgeType.isTypeOf({ paginator: paginator2 }))
})

test('_getEdgeType will implement the edge interface', t => {
  const connectionForge = new ConnectionForge(mockTypeForge())
  const edgeType = connectionForge._getEdgeType(mockPaginator())
  t.is(edgeType.getInterfaces()[0], connectionForge._edgeInterfaceType)
})

test('_getEdgeType will correctly return a namespaced cursor', t => {
  const connectionForge = new ConnectionForge(mockTypeForge())
  const edgeType = connectionForge._getEdgeType(mockPaginator({ name: 'foo' }), mockGQLType())
  t.deepEqual(edgeType.getFields().cursor.resolve({ cursor: 'foobar' }), {
    paginatorName: 'foo',
    orderingName: null,
    cursor: 'foobar',
  })
  t.deepEqual(edgeType.getFields().cursor.resolve({ cursor: 'xyz', ordering: { name: 'bar' } }), {
    paginatorName: 'foo',
    orderingName: 'bar',
    cursor: 'xyz',
  })
})

test('_getEdgeType will just return the value for the node field', t => {
  const value = Symbol('value')
  const connectionForge = new ConnectionForge(mockTypeForge())
  const edgeType = connectionForge._getEdgeType(mockPaginator())
  t.is(edgeType.getFields().node.resolve({ value }), value)
})

test('_getOrderByEnumType will create an enum type with all the paginator orderings', t => {
  const a = Symbol('a')
  const b = Symbol('b')
  const orderings = [{ name: 'a', a }, { name: 'b', b }]
  const connectionForge = new ConnectionForge(mockTypeForge())
  const enumType = connectionForge._getOrderByEnumType(mockPaginator({ name: 'bar', orderings, gqlType: mockGQLType('Foo') }))
  t.is(enumType.name, 'BarOrderBy')
  t.deepEqual(enumType.getValues(), [{
    name: 'A',
    value: orderings[0],
    description: undefined,
    deprecationReason: undefined,
  }, {
    name: 'B',
    value: orderings[1],
    description: undefined,
    deprecationReason: undefined,
  }])
})

test('_getConnectionType will have the right name', t => {
  const connectionForge = new ConnectionForge(mockTypeForge())
  const connectionType = connectionForge._getConnectionType(mockPaginator({ name: 'bar', gqlType: mockGQLType('Foo') }))
  t.is(connectionType.name, 'BarConnection')
})

test('_getConnectionType will implement the connection interface', t => {
  const connectionForge = new ConnectionForge(mockTypeForge())
  const connectionType = connectionForge._getConnectionType(mockPaginator())
  t.is(connectionType.getInterfaces()[0], connectionForge._connectionInterfaceType)
})

test('_getConnectionType will correctly implment isTypeOf', t => {
  const paginator1 = mockPaginator()
  const paginator2 = mockPaginator()
  const connectionForge = new ConnectionForge(mockTypeForge())
  const connectionType = connectionForge._getConnectionType(paginator1, mockGQLType())
  t.true(connectionType.isTypeOf({ paginator: paginator1 }))
  t.false(connectionType.isTypeOf({ paginator: paginator2 }))
})

test('_getConnectionType will resolve the source verbatim for pageInfo', t => {
  const source = Symbol('source')
  const connectionForge = new ConnectionForge(mockTypeForge())
  const connectionType = connectionForge._getConnectionType(mockPaginator())
  t.is(connectionType.getFields().pageInfo.resolve(source), source)
})

test('_getConnectionType will use the paginators count method for totalCount', t => {
  t.plan(3)

  const count = Symbol('count')
  const args = Symbol('args')
  const context = Symbol('context')
  const condition = Symbol('condition')

  const paginator = {
    getName: () => 'paginator',
    getType: () => mockGQLType(),
    count: (countContext, countCondition) => {
      t.is(countContext, context)
      t.is(countCondition, condition)
      return count
    },
  }

  const connectionForge = new ConnectionForge(mockTypeForge())
  const connectionType = connectionForge._getConnectionType(paginator, mockGQLType())

  t.is(connectionType.getFields().totalCount.resolve({ condition }, args, context), count)
})

test('_getConnectionType will get the edges from the source page with some extra info', t => {
  const paginator = Symbol('paginator')
  const ordering = Symbol('ordering')
  const values = [{ value: 'a', cursor: 1 }, { value: 'b', cursor: 2 }]
  const connectionForge = new ConnectionForge(mockTypeForge())
  const connectionType = connectionForge._getConnectionType(mockPaginator())
  t.deepEqual(
    connectionType.getFields().edges.resolve({ paginator, ordering, page: { values } }),
    [{ value: 'a', cursor: 1, paginator, ordering }, { value: 'b', cursor: 2, paginator, ordering }],
  )
})

test('_getConnectionType will use _getEdgeType in a list for the edges field type', t => {
  t.plan(3)

  let edgeGqlType

  const paginator = mockPaginator()
  const connectionForge = new ConnectionForge(mockTypeForge())
  const { _getEdgeType } = connectionForge

  connectionForge._getEdgeType = edgePaginator => {
    t.is(edgePaginator, paginator)
    return (edgeGqlType = _getEdgeType.call(connectionForge, edgePaginator))
  }

  const connectionType = connectionForge._getConnectionType(paginator)

  t.true(connectionType.getFields().edges.type instanceof GraphQLList)
  t.is(connectionType.getFields().edges.type.ofType, edgeGqlType)
})

test('_getConnectionType will map the nodes field to page values', t => {
  const value1 = Symbol('value1')
  const value2 = Symbol('value2')
  const connectionForge = new ConnectionForge(mockTypeForge())
  const connectionType = connectionForge._getConnectionType(mockPaginator())
  t.deepEqual(
    connectionType.getFields().nodes.resolve({ page: { values: [{ value: value1 }, { value: value2 }] } }),
    [value1, value2],
  )
})

test('createField will only include a condition argument if a condition config was included', t => {
  const connectionForge = new ConnectionForge(mockTypeForge())
  t.falsy(connectionForge.createField(mockPaginator()).args.condition)
  t.truthy(connectionForge.createField(mockPaginator(), { conditionType: GraphQLID }).args.condition)
})

test('createField will throw when trying to resolve with cursors from different paginators', t => {
  const connectionForge = new ConnectionForge(mockTypeForge())
  const field = connectionForge.createField(mockPaginator({ name: 'foo' }), mockGQLType())
  t.throws(field.resolve(null, { before: { paginatorName: 'bar' } }), '`before` cursor can not be used with this connection.')
  t.throws(field.resolve(null, { after: { paginatorName: 'bar' } }), '`after` cursor can not be used with this connection.')
})

test('createField will throw when trying to resolve with cursors from different orderings', t => {
  const connectionForge = new ConnectionForge(mockTypeForge())
  const field = connectionForge.createField(mockPaginator({ name: 'foo' }), mockGQLType())
  t.throws(field.resolve(null, { orderBy: { name: 'buz' }, before: { paginatorName: 'foo', orderingName: null } }), '`before` cursor can not be used for this `orderBy` value.')
  t.throws(field.resolve(null, { orderBy: { name: 'buz' }, after: { paginatorName: 'foo', orderingName: null } }), '`after` cursor can not be used for this `orderBy` value.')
  t.throws(field.resolve(null, { orderBy: { name: 'buz' }, before: { paginatorName: 'foo', orderingName: 'bar' } }), '`before` cursor can not be used for this `orderBy` value.')
  t.throws(field.resolve(null, { orderBy: { name: 'buz' }, after: { paginatorName: 'foo', orderingName: 'bar' } }), '`after` cursor can not be used for this `orderBy` value.')
  t.throws(field.resolve(null, { orderBy: null, before: { paginatorName: 'foo', orderingName: 'buz' } }), '`before` cursor can not be used for this `orderBy` value.')
  t.throws(field.resolve(null, { orderBy: null, after: { paginatorName: 'foo', orderingName: 'buz' } }), '`after` cursor can not be used for this `orderBy` value.')
})

test('createField resolver will call Paginator#readPage and return the resulting page with some other values', async t => {
  t.plan(3)

  const context = Symbol('context')
  const page = Symbol('page')

  const paginator = mockPaginator({
    name: 'foo',
    readPage: (readPageContext, config) => {
      t.is(readPageContext, context)
      t.true(config.condition)
      return page
    },
  })

  const connectionForge = new ConnectionForge(mockTypeForge())
  const field = connectionForge.createField(paginator, mockGQLType())

  t.deepEqual(await field.resolve(null, {}, context), {
    paginator,
    ordering: undefined,
    condition: true,
    page,
  })
})

test('createField resolver will have a condition other than true if a config is provided', async t => {
  t.plan(4)

  const source = Symbol('source')
  const conditionArg = Symbol('conditionArg')
  const condition = Symbol('condition')

  const paginator = mockPaginator({
    name: 'foo',
    readPage: (context, config) => {
      t.true(config.condition === true || config.condition === condition)
      return null
    },
  })

  const connectionForge = new ConnectionForge(mockTypeForge())

  const field = connectionForge.createField(paginator, {
    conditionType: GraphQLID,
    getCondition: (conditionSource, conditionValue) => {
      t.is(conditionSource, source)
      t.is(conditionValue, conditionArg)
      return condition
    },
  })

  t.is((await field.resolve(source, { condition: conditionArg })).condition, condition)
})

test('createField will pass down valid cursors without orderings', async t => {
  t.plan(6)

  const cursor1 = Symbol('cursor1')
  const cursor2 = Symbol('cursor2')

  const beforeCursor = { paginatorName: 'foo', orderingName: null, cursor: cursor1 }
  const afterCursor = { paginatorName: 'foo', orderingName: null, cursor: cursor2 }

  const paginator1 = mockPaginator({
    name: 'foo',
    readPage (context, config) {
      t.falsy(config.ordering)
      t.is(config.beforeCursor, cursor1)
      t.falsy(config.afterCursor)
      return null
    },
  })

  const paginator2 = mockPaginator({
    name: 'foo',
    readPage (context, config) {
      t.falsy(config.ordering)
      t.falsy(config.beforeCursor)
      t.is(config.afterCursor, cursor2)
      return null
    },
  })

  const connectionForge = new ConnectionForge(mockTypeForge())

  connectionForge.createField(paginator1, mockGQLType()).resolve(null, { before: beforeCursor })
  connectionForge.createField(paginator2, mockGQLType()).resolve(null, { after: afterCursor })
})

test('createField will pass down valid cursors without orderings', async t => {
  t.plan(6)

  const ordering = { name: 'bar' }

  const cursor1 = Symbol('cursor1')
  const cursor2 = Symbol('cursor2')

  const beforeCursor = { paginatorName: 'foo', orderingName: 'bar', cursor: cursor1 }
  const afterCursor = { paginatorName: 'foo', orderingName: 'bar', cursor: cursor2 }

  const paginator1 = mockPaginator({
    name: 'foo',
    readPage (context, config) {
      t.is(config.ordering, ordering)
      t.is(config.beforeCursor, cursor1)
      t.falsy(config.afterCursor)
      return null
    },
  })

  const paginator2 = mockPaginator({
    name: 'foo',
    readPage (context, config) {
      t.is(config.ordering, ordering)
      t.falsy(config.beforeCursor)
      t.is(config.afterCursor, cursor2)
      return null
    },
  })

  const connectionForge = new ConnectionForge(mockTypeForge())

  await connectionForge.createField(paginator1, mockGQLType()).resolve(null, { orderBy: ordering, before: beforeCursor })
  await connectionForge.createField(paginator2, mockGQLType()).resolve(null, { orderBy: ordering, after: afterCursor })
})

test('createField will pass down first/last integers', async t => {
  t.plan(2)

  const first = Symbol('first')
  const last = Symbol('last')

  const paginator1 = mockPaginator({
    name: 'foo',
    readPage (context, config) {
      t.is(config.first, first)
      return null
    },
  })

  const paginator2 = mockPaginator({
    name: 'foo',
    readPage (context, config) {
      t.is(config.last, last)
      return null
    },
  })

  const connectionForge = new ConnectionForge(mockTypeForge())

  await connectionForge.createField(paginator1, mockGQLType()).resolve(null, { first })
  await connectionForge.createField(paginator2, mockGQLType()).resolve(null, { last })
})