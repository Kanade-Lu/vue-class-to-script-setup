import { parse } from '@babel/parser'
import type { NodePath } from '@babel/core'
import { traverse } from '@babel/core'
import t from '@babel/types'
import * as generator from '@babel/generator'

const refOrComputedProperty = new Set()
const createProp = (item: t.ClassProperty, value: t.ArgumentPlaceholder | t.JSXNamespacedName | t.SpreadElement | t.Expression | t.TSAsExpression, callExpress = t.identifier('ref')) => {
  const kind = t.identifier('ref') ? 'const' : 'let'
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
    const { value } = curv
    const decorator = curv.decorators && curv.decorators[0]
    const checkDecoratorType = (str: string) => decorator && t.isDecorator(decorator) && t.isCallExpression(decorator.expression) && t.isIdentifier(decorator.expression.callee) && decorator.expression.callee.name === str

    const valueIsUndefined = t.isIdentifier(value) && value.name === 'undefined'
    const isModel = checkDecoratorType('Model')
    const isProps = checkDecoratorType('Prop')
    const isRefDecorator = checkDecoratorType('Ref')

    if (t.isStringLiteral(value))
      prev.push(createProp(curv, t.stringLiteral(value.value)))

    else if (t.isBooleanLiteral(value))
      prev.push(createProp(curv, t.booleanLiteral(value.value)))

    else if (t.isNumericLiteral(value))
      prev.push(createProp(curv, t.numericLiteral(value.value)))

    else if (isModel || isProps)
      prev.push(curv)

    else if (isRefDecorator || valueIsUndefined)
      prev.push(createProp(curv, t.nullLiteral()))

    else if ((t.isIdentifier(value) && value.name !== 'undefined'))
      return prev
    else if (t.isArrayExpression(value))
      prev.push(createProp(curv, t.arrayExpression(value.elements)))

    else if (t.isObjectExpression(value))
      prev.push(createProp(curv, value, t.identifier('reactive')))

    else if (t.isTSAsExpression(value))
      prev.push(createProp(curv, value.expression, t.identifier('reactive')))

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
  if (t.isBlockStatement(body)) {
    const params = path.node.params as t.Identifier[]
    const func = t.arrowFunctionExpression(
      params,
      body,
    )
    func.async = true
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
  if(!t.isClassDeclaration(node)) return;
  if (
    node.superClass
    && t.isCallExpression(node.superClass)
    && (t.isIdentifier(node.superClass.callee) && node.superClass.callee.name === 'Mixins')
    || (t.isIdentifier(node.superClass) &&  node.superClass.name === 'Vue')
  )
    path.node.superClass = null
  path.replaceWithMultiple(path.node.body.body)
}

const addPointValue = (path: NodePath<t.MemberExpression>) => {
  const { node } = path
  const { property } = node
  if (!t.isIdentifier(property))
    return
  if (refOrComputedProperty.has(property.name)) {
    const newNode = t.memberExpression(node.object, t.identifier(`${property.name}.value`))
    path.replaceWith(newNode)
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
    Decorator(path) {
      const expression = path.node.expression
      // delete @Component
      if (t.isCallExpression(expression) && t.isIdentifier(expression.callee) && expression.callee.name === 'Component')
        path.remove()
    },

    ClassProperty(path) {
      replaceVuex(path)
    },
    ClassDeclaration(path) {
      replaceClassPropertyToRefOrReactive(path)
      removeClass(path)
    },
    ClassMethod(path) {
      replaceLifeStyle(path)
      replaceGetToComputed(path)
      replaceClassMethodToArrowFunction(path)
    },
    MemberExpression(path) {
      addPointValue(path)
    },
  })

  const result = new generator.CodeGenerator(ast, { }, code).generate()

  if (!result.code)
    console.error('replaceClassPropertyToRefOrReactive: 转换出错')

  return result.code || ''
}
