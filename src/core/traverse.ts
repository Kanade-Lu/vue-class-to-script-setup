import { parse } from '@babel/parser'
import type { NodePath } from '@babel/core'
import { traverse } from '@babel/core'
import t from '@babel/types'
import type { ObjectExpression } from '@babel/types'
import * as generator from '@babel/generator'

export const ComponentProps = [] as {
  name: string
  type: string
}[]
const refOrComputedProperty = new Set()
const createProp = (item: t.ClassProperty, value: t.ArgumentPlaceholder | t.JSXNamespacedName | t.SpreadElement | t.Expression | t.TSAsExpression, callExpress = t.identifier('ref')) => {
  const kind = callExpress.name === 'ref' ? 'const' : 'let'
  const itemKey = item.key as t.Identifier
  if (callExpress.name === 'ref')
    refOrComputedProperty.add(itemKey.name)

  return t.variableDeclaration(kind, [
    t.variableDeclarator(
      t.identifier(itemKey.name),
      t.callExpression(callExpress, [
        value,
      ]),
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
    const checkDecoratorType = (str: string) => decorator && t.isDecorator(decorator) && t.isCallExpression(decorator.expression) && t.isIdentifier(decorator.expression.callee) && decorator.expression.callee.name === str

    const valueIsUndefined = t.isIdentifier(value) && value.name === 'undefined'
    const isModel = checkDecoratorType('Model')
    const isProps = checkDecoratorType('Prop')
    const isRefDecorator = checkDecoratorType('Ref')
    const ComponentPropsNameList = ComponentProps.map((item: any) => item.name)

    if (t.isStringLiteral(value))
      prev.push(createProp(curv, t.stringLiteral(value.value)))

    else if (t.isBooleanLiteral(value))
      prev.push(createProp(curv, t.booleanLiteral(value.value)))

    else if (t.isNumericLiteral(value))
      prev.push(createProp(curv, t.numericLiteral(value.value)))

    else if (isModel || isProps)
      prev.push(curv)
      // (isRefDecorator && !!decorator === false)
    else if (isRefDecorator || valueIsUndefined)
      prev.push(createProp(curv, t.nullLiteral()))

    else if ((t.isIdentifier(value) && value.name !== 'undefined') || (t.isIdentifier(key) && ComponentPropsNameList.includes(key.name)))
      return prev
    else if (t.isArrayExpression(value))
      prev.push(createProp(curv, t.arrayExpression(value.elements)))

    else if (t.isObjectExpression(value))
      prev.push(createProp(curv, value, t.identifier('reactive')))

    else if (t.isTSAsExpression(value))
      prev.push(createProp(curv, value.expression, t.identifier('reactive')))
    else
      prev.push(curv)

    return prev
  }, [])
}

const replaceVuex = (path: NodePath<t.ClassProperty>) => {
// const replaceVuex = (path) => {
  const decorators = path.node.decorators
  const expression = decorators && decorators[0] && decorators[0].expression
  if (!expression)
    return
  if (!t.isCallExpression(expression))
    return
  if (!t.isIdentifier(expression.callee))
    return

  const value = expression.arguments[0]
  if (!t.isStringLiteral(value))
    return

  const key = path.node.key
  if (!t.isIdentifier(key))
    return

  const keyName = key.name

  if (expression.callee.name === 'Action') {
    const params = t.identifier('params')
    params.optional = true
    // const ${keyName} = (params?) => store.dispatch('${value.value}')
    path.replaceWithMultiple([
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
                t.identifier('dispatch'),
              ),
              [
                t.stringLiteral(value.value),
                t.identifier('params'),
              ],
            ),
          ),
        ),
      ]),
    ])
  }

  if (expression.callee.name === 'Getter') {
  // const ${keyName} = computed(() => store.getters['${value.value}'])
    refOrComputedProperty.add(keyName)
    path.replaceWithMultiple([
      t.variableDeclaration('const', [
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
                    t.identifier('getters'),
                  ),
                  t.stringLiteral(value.value),
                  true,
                ),
              ),
            ],
          ),
        ),
      ]),
    ])
  }

  if (expression.callee.name === 'State') {
  // const ${keyName} = computed(() => store.state['${value.value}'])
    refOrComputedProperty.add(keyName)
    path.replaceWithMultiple([
      t.variableDeclaration('const', [
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
                    t.identifier('state'),
                  ),
                  t.stringLiteral(value.value),
                  true,
                ),
              ),
            ],
          ),
        ),
      ]),
    ])
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
  if (!(path.node && path.node.body))
    return
  const { body } = path.node
  const decorator = path.node.decorators && path.node.decorators[0]
  const checkDecoratorType = (str: string) => decorator && t.isDecorator(decorator) && t.isCallExpression(decorator.expression) && t.isIdentifier(decorator.expression.callee) && decorator.expression.callee.name === str
  if (checkDecoratorType('Emit'))
    return
  if (t.isBlockStatement(body)) {
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

export const traverseCode = (code: string) => {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'classProperties', ['decorators', {
      decoratorsBeforeExport: true,
    }]],
  })
  traverse(ast, {
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
      replaceClassMethodToArrowFunction(path)
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
