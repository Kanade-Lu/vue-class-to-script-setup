import { parse } from '@babel/parser'
import type { NodePath } from '@babel/core'
import { traverse } from '@babel/core'
import t from '@babel/types'
import type { ObjectExpression, TSTypeAnnotation } from '@babel/types'
import * as generator from '@babel/generator'

export const ComponentProps = [] as {
  name: string
  type: string
}[]
const refOrComputedProperty = new Set()
const createProp = ({
  item,
  value,
  callExpress,
  tsType,
}: {
  item: t.ClassProperty
  value: t.ArgumentPlaceholder | t.JSXNamespacedName | t.SpreadElement | t.Expression | t.TSAsExpression
  callExpress?: t.Identifier
  tsType?: t.TSType
}) => {
  callExpress = callExpress || t.identifier('ref')
  const kind = callExpress.name === 'ref' ? 'const' : 'let'
  const itemKey = item.key as t.Identifier
  if (callExpress.name === 'ref')
    refOrComputedProperty.add(itemKey.name)

  const callExpression = t.callExpression(callExpress, [
    value,
  ])
  if (tsType) {
    callExpression.typeParameters = t.tsTypeParameterInstantiation([
      tsType,
    ])
  }

  return t.variableDeclaration(kind, [
    t.variableDeclarator(
      t.identifier(itemKey.name),
      callExpression,
    ),
  ])
}

const replaceLifeStyle = (path: NodePath<t.ClassMethod>) => {
  const keyNode = path.node.key
  if (!t.isIdentifier(keyNode))
    return
  if (keyNode.name === 'created') {
    const body = path.node.body.body
    path.replaceWithMultiple(body)
  }
  if (keyNode.name === 'mounted') {
    const body = path.node.body.body
    const asyncFn = body.some((node) => {
      if (t.isExpressionStatement(node))
        return t.isAwaitExpression(node.expression)

      return false
    })
    const mountedBody = t.arrowFunctionExpression(
      [],
      t.blockStatement(body),
    )
    if (asyncFn)
      mountedBody.async = true

    const onMounted = t.expressionStatement(
      t.callExpression(
        t.identifier('onMounted'),
        [
          mountedBody,
        ],
      ),
    )

    path.replaceWithMultiple([
      onMounted,
    ])
  }
}

const replaceClassPropertyToRefOrReactive = (path: NodePath<t.ClassDeclaration>) => {
  path.node.body.body = path.node.body.body.reduce((prev: any, curv) => {
    if (!t.isClassProperty(curv)) {
      prev.push(curv)
      return prev
    }
    const { value, key } = curv
    const decorator = curv.decorators && curv.decorators[0]
    const checkDecoratorType = (str: string) => {
      if (!(decorator && t.isDecorator(decorator) && t.isCallExpression(decorator.expression)))
        return false
      const callee = decorator!.expression.callee
      if (!callee)
        return false
      if (t.isIdentifier(callee))
        return callee.name === str

      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property))
        return callee.property.name === str

      return false
    }

    const valueIsUndefined = t.isIdentifier(value) && value.name === 'undefined'

    const isModel = checkDecoratorType('Model')
    const isProps = checkDecoratorType('Prop')
    const isRefDecorator = checkDecoratorType('Ref')

    const isVuex = checkDecoratorType('State') || checkDecoratorType('Getter') || checkDecoratorType('Mutation') || checkDecoratorType('Action')
    const ComponentPropsNameList = ComponentProps.map((item: any) => item.name)
    const typeAnnotation = curv.typeAnnotation as TSTypeAnnotation
    const tsType = typeAnnotation && typeAnnotation.typeAnnotation
    const isOnlyObjectType = (value === null || valueIsUndefined || t.isNullLiteral(value)) && t.isTSTypeLiteral(tsType)

    const createValue = (value: any) => {
      if (t.isStringLiteral(value))
        return t.stringLiteral(value.value)

      if (t.isBooleanLiteral(value))
        return t.booleanLiteral(value.value)

      if (t.isNumericLiteral(value))
        return t.numericLiteral(value.value)

      if (isRefDecorator || valueIsUndefined || value === null || t.isNullLiteral(value))
        return t.nullLiteral()

      if (t.isArrayExpression(value))
        return t.arrayExpression(value.elements)

      if (t.isTSAsExpression(value))
        return value.expression

      return value
    }

    const newProps = (itemValue: any, callExpress?: any): t.VariableDeclaration => {
      const value = createValue(itemValue)
      const options = {
        item: curv,
        value,
        callExpress,
      } as {
        item: t.ClassProperty
        value: t.ArgumentPlaceholder | t.JSXNamespacedName | t.SpreadElement | t.Expression | t.TSAsExpression
        callExpress?: t.Identifier
        tsType?: t.TSType
      }
      if (tsType)
        options.tsType = tsType

      return createProp(options)
    }
    if (isModel || isProps || isVuex)
      prev.push(curv)

    else if (t.isObjectExpression(value) || t.isTSAsExpression(value) || isOnlyObjectType)
      prev.push(newProps(value, t.identifier('reactive')))

    else if (t.isStringLiteral(value) || t.isBooleanLiteral(value) || t.isNumericLiteral(value) || isRefDecorator || valueIsUndefined || value === null || t.isArrayExpression(value) || t.isNullLiteral(value))
      prev.push(newProps(value))

    else if ((t.isIdentifier(value) && value.name !== 'undefined') || (t.isIdentifier(key) && ComponentPropsNameList.includes(key.name)))
      return prev

    else
      prev.push(curv)

    return prev
  }, [])
}

const replaceVuex = (path: NodePath<t.ClassProperty>) => {
  const decorators = path.node.decorators
  const expression = decorators && decorators[0] && decorators[0].expression
  if (!expression)
    return
  if (!t.isCallExpression(expression))
    return
  if (!(t.isIdentifier(expression.callee) || t.isMemberExpression(expression.callee)))
    return

  const value = expression.arguments[0]
  if (!t.isStringLiteral(value))
    return

  const key = path.node.key
  if (!t.isIdentifier(key))
    return

  const keyName = key.name

  const stateDeclaration = (identifier: t.Identifier, stringValue = t.stringLiteral(value.value)) => (t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(keyName),
      t.callExpression(
        t.identifier('computed'),
        [
          t.arrowFunctionExpression(
            [],
            t.memberExpression(
              t.memberExpression(
                t.identifier('store'),
                identifier,
              ),
              stringValue,
              true,
            ),
          ),
        ],
      ),
    ),
  ]))

  const callee = expression.callee
  const params = t.identifier('params')
  params.optional = true
  const actionDeclaration = (identifier: t.Identifier, value: t.StringLiteral) => (
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(keyName),
        t.arrowFunctionExpression(
          [
            params,
          ],
          t.callExpression(
            t.memberExpression(
              t.identifier('store'),
              // t.identifier('dispatch'),
              identifier,
            ),
            [
              // t.stringLiteral(value.value),
              value,
              t.identifier('params'),
            ],
          ),
        ),
      ),
    ])
  )

  if (t.isIdentifier(callee)) {
    if (callee.name === 'Action') {
      // const ${keyName} = (params?) => store.dispatch('${value.value}')
      path.replaceWithMultiple([
        actionDeclaration(t.identifier('dispatch'), t.stringLiteral(value.value)),
      ])
    }
    else if (callee.name === 'Getter') {
      // const ${keyName} = computed(() => store.getters['${value.value}'])
      refOrComputedProperty.add(keyName)
      path.replaceWithMultiple([
        stateDeclaration(t.identifier('getters')),
      ])
    }

    else if (callee.name === 'State') {
      // const ${keyName} = computed(() => store.state['${value.value}'])
      refOrComputedProperty.add(keyName)
      path.replaceWithMultiple([
        stateDeclaration(t.identifier('state')),
      ])
    }
    else if (callee.name === 'Mutation') {
      // const ${keyName} = (params?) => store.commit('${value.value}')
      path.replaceWithMultiple([
        actionDeclaration(t.identifier('commit'), t.stringLiteral(value.value)),
      ])
    }
  }
  else if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && t.isIdentifier(callee.object)) {
    if (callee.property?.name === 'Action') {
      path.replaceWithMultiple([
        actionDeclaration(t.identifier('dispatch'), t.stringLiteral(`${callee.object.name}/${value.value}`)),
      ])
    }
    else if (callee.property?.name === 'Mutation') {
      // const ${keyName} = (params?) => store.commit('${value.value}')
      path.replaceWithMultiple([
        actionDeclaration(t.identifier('commit'), t.stringLiteral(`${callee.object.name}/${value.value}`)),
      ])
    }
    else if (callee.property?.name === 'Getter') {
      // const ${keyName} = computed(() => store.getters['${value.value}'])
      refOrComputedProperty.add(keyName)
      path.replaceWithMultiple([
        stateDeclaration(t.identifier('getters'), t.stringLiteral(`${callee.object.name}/${value.value}`)),
      ])
    }

    else if (callee.property?.name === 'State') {
      // const ${keyName} = computed(() => store.state['${value.value}'])
      refOrComputedProperty.add(keyName)
      path.replaceWithMultiple([
        stateDeclaration(t.identifier('state'), t.stringLiteral(`${callee.object.name}/${value.value}`)),
      ])
    }
  }
}
const replaceGetToComputed = (path: NodePath<t.ClassMethod>) => {
  if (path.node && path.node.kind === 'get') {
    const { body, key } = path.node
    if (!t.isIdentifier(key))
      return
    refOrComputedProperty.add(key.name)
    path.replaceWithMultiple([
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(key.name),
          t.callExpression(
            t.identifier('computed'),
            [
              t.arrowFunctionExpression(
                [],
                body,
              ),
            ],
          ),
        ),
      ]),
    ])
  }
}

const replaceClassMethodToArrowFunction = (path: NodePath<t.ClassMethod>) => {
  const body = path.node.body
  const params = path.node.params as t.Identifier[]
  const func = t.arrowFunctionExpression(
    params,
    body,
  )
  func.async = path.node.async
  const key = path.node.key
  if (!t.isIdentifier(key))
    return
  const replaceBody = t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(key.name),
      func,
    ),
  ])

  path.replaceWithMultiple([
    replaceBody,
  ])
}

/**
 *  replace
 *  @Watch('applicationTime')
    handleApplicationTime(val) {
      if (val) {
        this.searchParams.signed_at_from = val[0]
        this.searchParams.signed_at_to = val[1]
      } else {
        this.searchParams.signed_at_from = this.searchParams.signed_at_to = ''
      }
    }

    to

    watch(() => applicationTime, (val) => {
      if (val) {
        this.searchParams.signed_at_from = val[0]
        this.searchParams.signed_at_to = val[1]
      } else {
        this.searchParams.signed_at_from = this.searchParams.signed_at_to = ''
      }
    })
 */

const replaceWatch = (path: NodePath<t.ClassMethod>) => {
  const body = path.node.body
  const params = path.node.params as t.Identifier[]
  const func = t.arrowFunctionExpression(
    params,
    body,
  )
  func.async = path.node.async
  // const key = path.node.key
  const argument = path.node.decorators && path.node.decorators[0] && path.node.decorators[0].expression && t.isCallExpression(path.node.decorators[0].expression) && path.node.decorators[0].expression.arguments[0]
  if (!(argument && t.isStringLiteral(argument)))
    return
  const key = argument.value
  const replaceBody = t.expressionStatement(
    t.callExpression(
      t.identifier('watch'),
      [
        t.arrowFunctionExpression(
          [],
          t.memberExpression(
            t.thisExpression(),
            t.identifier(key),
          ),
        ),
        func,
      ],
    ),
  )

  path.replaceWithMultiple([
    replaceBody,
  ])
}

const replaceClassMethod = (path: NodePath<t.ClassMethod>) => {
  if (!(path.node && path.node.body))
    return
  const decorator = path.node.decorators && path.node.decorators[0]
  const checkDecoratorType = (str: string) => {
    return decorator && t.isDecorator(decorator) && t.isCallExpression(decorator.expression) && t.isIdentifier(decorator.expression.callee) && decorator.expression.callee.name === str
  }

  if (checkDecoratorType('Emit'))
    return
  if (checkDecoratorType('Watch'))
    replaceWatch(path)
  else
    replaceClassMethodToArrowFunction(path)
}
const removeClass = (path: NodePath<t.ClassDeclaration>) => {
  const node = path.node
  if (!t.isClassDeclaration(node))
    return
  const isExtendsVue = t.isIdentifier(node.superClass) && node.superClass.name === 'Vue'
  const isExtendsMixin = node.superClass && t.isCallExpression(node.superClass) && (t.isIdentifier(node.superClass.callee) && node.superClass.callee.name === 'Mixins')
  if (isExtendsVue || isExtendsMixin)
    path.node.superClass = null
  path.replaceWithMultiple(path.node.body.body)
}

const addPointValue = (path: NodePath<t.MemberExpression>) => {
  const { node } = path
  const { property } = node
  if (!t.isIdentifier(property))
    return

  /**
   * 为了避免MemberExpression和Identifier重名
   * const totalNum = computed(() => {
      return store.state.storeManage.totalNum.value;
    });
   */
  // console.log(path.parentPath?.parentPath?.parentPath?.parentPath?.container?.id?.name, property.name)
  const container = path.parentPath?.parentPath?.parentPath?.parentPath?.container as t.VariableDeclarator
  const id = container?.id as t.Identifier
  if (id?.name === property.name)
    return

  if (refOrComputedProperty.has(property.name)) {
    const newNode = t.memberExpression(node.object, t.identifier(`${property.name}.value`))
    path.replaceWith(newNode)
  }
}

const vueTypeMap = {
  Number: 'number',
  String: 'string',
  Boolean: 'boolean',
  Array: 'any[]',
  Object: 'object',
  Function: 'Function',
  Promise: 'Promise',
  Date: 'Date',
  RegExp: 'RegExp',
  Symbol: 'Symbol',
}
const findAllComponentProps = (path: NodePath<t.ClassDeclaration>) => {
  if (!path.node.decorators)
    return
  const expression = path.node.decorators[0].expression
  // delete @Component
  if (t.isCallExpression(expression) && t.isIdentifier(expression.callee) && expression.callee.name === 'Component') {
    (expression.arguments[0] as ObjectExpression).properties.forEach((item) => {
      if (!t.isObjectProperty(item))
        return
      if (!t.isIdentifier(item.key))
        return
      if (!t.isObjectExpression(item.value))
        return
      if (item.key.name === 'props') {
        item.value.properties.forEach((prop) => {
          if (!t.isObjectProperty(prop))
            return
          if (t.isIdentifier(prop.key)) {
            if (t.isIdentifier(prop.value)) {
              ComponentProps.push({
                name: prop.key.name,
                type: vueTypeMap[prop.value.name as keyof typeof vueTypeMap],
              })
            }
            const valueObjectExpression = prop.value

            if (t.isObjectExpression(valueObjectExpression)) {
              const property = valueObjectExpression.properties.find((item) => {
                if (!t.isObjectProperty(item))
                  return false
                if (!t.isIdentifier(item.key))
                  return false
                return item.key.name === 'type'
              })
              if (!property)
                return
              if (!t.isObjectProperty(property))
                return
              if (!t.isIdentifier(property.value))
                return
              ComponentProps.push({
                name: prop.key.name,
                type: vueTypeMap[property?.value?.name as keyof typeof vueTypeMap],
              })
            }
          }
        })
      }
    })
  }
}
const removeNamespace = (path: NodePath<t.VariableDeclaration>) => {
  const { node } = path
  if (!t.isVariableDeclaration(node))
    return
  const { declarations } = node
  if (!declarations.length)
    return
  const { init } = declarations[0]
  if (!t.isCallExpression(init))
    return
  const callee = init.callee
  if (!t.isIdentifier(callee))
    return
  if (callee.name === 'namespace')
    path.remove()
}

export const traverseCode = (code: string) => {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'classProperties', ['decorators', {
      decoratorsBeforeExport: true,
    }]],
  })
  traverse(ast, {
    VariableDeclaration(path) {
      removeNamespace(path)
    },
    ClassProperty(path) {
      replaceVuex(path)
    },
    ClassDeclaration(path) {
      findAllComponentProps(path)
      replaceClassPropertyToRefOrReactive(path)
      removeClass(path)
    },
    ClassMethod(path) {
      replaceLifeStyle(path)
      replaceGetToComputed(path)
      replaceClassMethod(path)
    },
    MemberExpression(path: NodePath<t.MemberExpression>) {
      addPointValue(path)
    },

  })

  const result = new generator.CodeGenerator(ast, { }, code).generate()

  if (!result.code)
    console.error('replaceClassPropertyToRefOrReactive: 转换出错')

  return result.code || ''
}
