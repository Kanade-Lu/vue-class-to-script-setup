import { parse } from '@babel/parser'
import type { NodePath } from '@babel/core'
import { traverse } from '@babel/core'
import t from '@babel/types'
import type { ObjectExpression, ObjectProperty, TSTypeAnnotation } from '@babel/types'
import * as generator from '@babel/generator'
import minimist from 'minimist'

export const ComponentProps = [] as {
  name: string
  type: string
}[]
export function resetComponentProps() {
  ComponentProps.length = 0
}

const argv = minimist(process.argv.slice(3))
const allRef = 'allRef' in argv ? Boolean(argv.allRef) : true


const refOrComputedProperty = new Set()
const reactiveProperty = new Set()
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
  const itemKey = item.key as t.Identifier
  if (callExpress.name === 'ref')
    refOrComputedProperty.add(itemKey.name)
  else if (callExpress.name === 'reactive')
    reactiveProperty.add(itemKey.name)

  const callExpression = t.callExpression(callExpress, [
    value,
  ])
  if (tsType) {
    callExpression.typeParameters = t.tsTypeParameterInstantiation([
      tsType,
    ])
  }

  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(itemKey.name),
      callExpression,
    ),
  ])
}

const replaceUniAppLiftStyle = (path: NodePath<t.ClassMethod>) => {

  if (!path.node)
    return
  if (!('key' in path.node))
    return
  const keyNode = path.node.key
  if (!t.isIdentifier(keyNode))
    return

  const replaceKeyNodeNameList = [
    'onShow',
    'onLoad',
    'onHide',
    'onReachBottom',
    'onPageScroll',
  ]
  if (replaceKeyNodeNameList.includes(keyNode.name)) {
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

    const liftStyle = t.expressionStatement(
      t.callExpression(
        t.identifier(keyNode.name),
        [
          mountedBody,
        ],
      ),
    )

    path.replaceWithMultiple([
      liftStyle,
    ])
  }
}

const replaceLifeStyle = (path: NodePath<t.ClassMethod>) => {
  const keyNode = path.node.key
  if (!t.isIdentifier(keyNode))
    return
  // if (keyNode.name === 'created') {
  //   const body = path.node.body.body
  //   path.replaceWithMultiple(body)
  // }
  if (keyNode.name === 'mounted' || keyNode.name === 'created') {
    const body = path.node.body.body
    const asyncFn = body.some((node) => {
      if (t.isExpressionStatement(node)) {
        if (t.isAssignmentExpression(node.expression))
          return t.isAwaitExpression(node.expression.right)

        return t.isAwaitExpression(node.expression)
      }

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
        return callee.name === str || callee.name.includes(str)

      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property))
        return callee.property.name === str || callee.property.name.includes(str)

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
      allRef ? prev.push(newProps(value)) : prev.push(newProps(value, t.identifier('reactive')))

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
    if (callee.name.includes('Action')) {
      // const ${keyName} = (params?) => store.dispatch('${value.value}')
      path.replaceWithMultiple([
        actionDeclaration(t.identifier('dispatch'), t.stringLiteral(value.value)),
      ])
    }
    else if (callee.name.includes('Getter')) {
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

const addPointValue = (path: NodePath<t.MemberExpression>, refList?: Set<any>) => {
  if (!refList)
    return

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

  if (refList.has(property.name)  && t.isThisExpression(path.node.object)) {
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
      if (item.key.name === 'filters') {
        item.value.properties.forEach((prop) => {
          if (t.isObjectMethod(prop)) {
            if (!t.isIdentifier(prop.key))
              return

            path.insertAfter(
              t.variableDeclaration('const', [
                t.variableDeclarator(
                  t.identifier(prop.key.name),
                  t.arrowFunctionExpression(
                    prop.params,
                    prop.body,
                  ),
                ),
              ]),
            )
          }
          if (t.isObjectProperty(prop)) {
            if (!t.isIdentifier(prop.key))
              return
            if (!t.isArrowFunctionExpression(prop.value))
              return
            path.insertAfter(
              t.variableDeclaration('const', [
                t.variableDeclarator(
                  t.identifier(prop.key.name),
                  prop.value,
                ),
              ]),
            )
          }
        })
      }
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

/**
 *  const obj = reactive({})
 *
 *  replace
 *  obj = {
 *     title: '',
        page: 1,
        count: 10
 *  }
    =>
    Object.assnig(obj, {
      title: '',
      page: 1,
      count: 10
    })

 */
const replaceReactiveExpressionStatement = (path: NodePath<t.ExpressionStatement>) => {
  if (!t.isAssignmentExpression(path.node.expression))
    return

  const node = path.node.expression
  if (node.operator !== '=')
    return
  if (!t.isMemberExpression(node.left))
    return
  if (!t.isIdentifier(node.left.property))
    return
  if (!reactiveProperty.has(node.left.property.name))
    return

  const right = node.right
  const left = node.left
  const newNode = t.callExpression(
    t.memberExpression(t.identifier('Object'), t.identifier('assign')),
    [left, right],
  )
  path.replaceWith(newNode)
}

const replaceArrowClassMethod = (path: NodePath<t.ClassProperty>) => {
  if (!path.node || !t.isArrowFunctionExpression(path.node.value))
    return

  if (!t.isIdentifier(path.node.key))
    return
  const arrowValue = path.node.value
  path.replaceWithMultiple([
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(path.node.key.name),
        t.arrowFunctionExpression(
          arrowValue.params,
          arrowValue.body,
        ),
      ),
    ]),
  ])
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
      replaceArrowClassMethod(path)
    },
    ClassDeclaration(path) {
      findAllComponentProps(path)
      replaceClassPropertyToRefOrReactive(path)
      removeClass(path)
    },
    ClassMethod(path) {
      replaceLifeStyle(path)
      replaceUniAppLiftStyle(path)
      replaceGetToComputed(path)
      replaceClassMethod(path)
    },
    MemberExpression(path: NodePath<t.MemberExpression>) {
      addPointValue(path, refOrComputedProperty)
    },
  })
  traverse(ast, {
    ExpressionStatement(path: NodePath<t.ExpressionStatement>) {
      replaceReactiveExpressionStatement(path)
    },
  })

  const result = new generator.CodeGenerator(ast, {
    jsescOption: { minimal: true },
  }, code).generate()

  if (!result.code)
    console.error('replaceClassPropertyToRefOrReactive: 转换出错')

  return result.code || ''
}

const toRefsPropertyList = new Set()
const searchAllToRefsProperty = (path: NodePath<t.VariableDeclarator>) => {
  const { node } = path
  if (!t.isVariableDeclarator(node))
    return
  if (!t.isCallExpression(node.init))
    return
  if (!t.isIdentifier(node.init.callee))
    return
  if (node.init.callee.name !== 'toRefs')
    return
  if (!t.isObjectPattern(node.id))
    return
  const properties = node.id.properties
  properties.forEach((item) => {
    if (!t.isObjectProperty(item))
      return
    if (!t.isIdentifier(item.value))
      return
    toRefsPropertyList.add(item.value.name)
  })
}

export const addPointValueForToRefs = (code: string) => {
  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'classProperties', ['decorators', {
        decoratorsBeforeExport: true,
      }]],
    })
    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        searchAllToRefsProperty(path)
      },
    })
    traverse(ast, {
      MemberExpression(path: NodePath<t.MemberExpression>) {
        addPointValue(path, toRefsPropertyList)
      },
    })
    const result = new generator.CodeGenerator(ast, {
      jsescOption: { minimal: true },
    }, code).generate()

    if (!result.code)
      console.error('replaceClassPropertyToRefOrReactive: 转换出错')

    return result.code || ''
  }
  catch (error) {
    console.error(error)
    return code
  }
}
const createArrowFunction = (body: t.Statement[]) => {
  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier('useXXX'),
      t.arrowFunctionExpression(
        [],
        t.blockStatement(body),
      ),
    ),
  ])
}
export const createUseXXX = (code: string) => {
  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'classProperties', ['decorators', {
        decoratorsBeforeExport: true,
      }]],
    })
    traverse(ast, {
      Program(path) {
        const importList = path.node.body.filter(item => item.type === 'ImportDeclaration')
        const expressionList = path.node.body.filter(item => item.type === 'ExpressionStatement')

        const otherBody = path.node.body.filter(item => item.type === 'VariableDeclaration')
        const createReturnList = otherBody
          .filter(item => item.type === 'VariableDeclaration' && t.isIdentifier(item.declarations[0].id))
          .map((item) => {
        	if (item.type === 'VariableDeclaration' && t.isIdentifier(item.declarations[0].id))
              return t.objectProperty(t.identifier(item.declarations[0].id.name), t.identifier(item.declarations[0].id.name))
          })
        const createReturn = t.returnStatement(t.objectExpression(createReturnList as ObjectProperty[]))
        path.node.body = [...importList, createArrowFunction([...otherBody, ...expressionList, createReturn])]
      },
    })
    const result = new generator.CodeGenerator(ast, {
      jsescOption: { minimal: true },
    }, code).generate()

    if (!result.code)
      console.error('replaceClassPropertyToRefOrReactive: 转换出错')

    return result.code || ''
  }
  catch (error) {
    console.error(error)
    return code
  }
}

