// @ts-nocheck
import { parse } from '@babel/parser'
import type { NodePath } from '@babel/core'
import { traverse } from '@babel/core'
import t from '@babel/types'
import * as generator from '@babel/generator'

const refOrComputedProperty = new Set()
const createProp = (item: t.ClassProperty, value: t.ArgumentPlaceholder | t.JSXNamespacedName | t.SpreadElement | t.Expression | t.TSAsExpression, callExpress = t.identifier('ref')) => {
  const kind = t.identifier("ref") ? "const" : "let";
  if (callExpress.name === 'ref') refOrComputedProperty.add(item.key.name);

  return t.variableDeclaration(kind, [
    t.variableDeclarator(
      t.identifier((item.key).name),
      t.callExpression(callExpress, [
        value,
      ]),
    ),
  ])
}

const replaceLifeStyle = (path: NodePath<t.ClassMethod>) => {
  const keyNode = path.node.key
  if (keyNode.name === 'created') {
    const body = path.node.body.body
    path.replaceWithMultiple(body)
  }
  if (keyNode.name === 'mounted') {
    const body = path.node.body.body
    const asyncFn = body.some(node => t.isAwaitExpression(node.expression))
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

const replaceClassPropertyToRefOrReactive = (path) => {
  path.node.body.body = path.node.body.body.reduce((prev, curv) => {
    if (!t.isClassProperty(curv)) {
      prev.push(curv)
      return prev;
     }
    const { value } = curv;

    if (t.isStringLiteral(value)) {
      prev.push(createProp(curv, t.stringLiteral(value.value)));
    } else if (t.isBooleanLiteral(value)) {
      prev.push(createProp(curv, t.booleanLiteral(value.value)));
    } else if (t.isNumericLiteral(value)) {
      prev.push(createProp(curv, t.numericLiteral(value.value)));
    } else if (t.isIdentifier(value)) return prev;
    else if (t.isArrayExpression(value)) {
      prev.push(createProp(curv, t.arrayExpression(value.elements)));
    } else if (t.isObjectExpression(value)) {
      prev.push(createProp(curv, value, t.identifier("reactive")));
    } else if (t.isTSAsExpression(value)) prev.push(createProp(curv, value.expression, t.identifier("reactive")));

    return prev;
  }, []);
}

const replaceVuex = (path) => {
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
const replaceGetToComputed = (path) => {
  if (path.node && path.node.kind === 'get') {
    const { body, key } = path.node
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
    const params = path.node.params

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
const removeClass = (path) => {
  if (
    path.node.superClass
    && t.isCallExpression(path.node.superClass)
    && (path.node.superClass.callee.name === 'Mixins' || path.node.superClass.name === 'Vue')
  )
    path.node.superClass = null
  path.replaceWithMultiple(path.node.body.body)
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
      const { node } = path
      const { property } = node
      if (!t.isIdentifier(property))
        return
      if (refOrComputedProperty.has(property.name)) {
        const newNode = t.memberExpression(node.object, t.identifier(`${property.name}.value`))
        path.replaceWith(newNode)
      }
    },
  })


  const result = new generator.CodeGenerator(ast, { }, code).generate()

  if (!result.code)
    console.error('replaceClassPropertyToRefOrReactive: 转换出错')

  return result.code || ''
}
