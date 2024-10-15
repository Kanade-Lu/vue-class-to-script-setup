import { parse } from "@babel/parser";
import { traverse } from "@babel/core";
import t from "@babel/types";
import * as generator from "@babel/generator";

const refOrComputedProperty = new Set();
const reactiveProperty = new Set();
const propsProperty = new Set();

const stateDeclaration = (
  keyName,
  identifier,
  stringValue
) =>
  t.variableDeclaration("const", [
    t.variableDeclarator(
      t.identifier(keyName),
      t.callExpression(t.identifier("computed"), [
        t.arrowFunctionExpression(
          [],
          t.memberExpression(
            t.memberExpression(t.identifier("store"), identifier),
            stringValue,
            true
          )
        ),
      ])
    ),
  ]);

const actionDeclaration = (
  keyName,
  params,
  value,
  type = t.identifier("dispatch")
) =>
  t.variableDeclaration("const", [
    t.variableDeclarator(
      t.identifier(keyName),
      t.arrowFunctionExpression(
        [params],
        t.callExpression(
          t.memberExpression(
            t.identifier("store"),
            // t.identifier('dispatch'),
            type
          ),
          [
            // t.stringLiteral(value.value),
            value,
            t.identifier("params"),
          ]
        )
      )
    ),
  ]);

const createProp = ({ item, value, callExpress, tsType }) => {
  callExpress = callExpress || t.identifier("ref");
  if (!("key" in item)) return;
  const itemKey = item.key;
  if (callExpress.name === "ref") refOrComputedProperty.add(itemKey.name);
  else if (callExpress.name === "reactive") reactiveProperty.add(itemKey.name);

  const callExpression = t.callExpression(callExpress, [value]);
  if (tsType)
    callExpression.typeParameters = t.tsTypeParameterInstantiation([tsType]);

  return t.variableDeclaration("const", [
    t.variableDeclarator(t.identifier(itemKey.name), callExpression),
  ]);
};

function findLastIndex(array, callback) {
  for (let i = array.length - 1; i >= 0; i--) {
    if (callback(array[i])) return i;
  }
  return -1;
}
const findBodyLastIndex = (path) => {
  // 找到最后一个 import 语句
  const parentBody = path.get("body");
  const index = findLastIndex(parentBody, (p) =>
    t.isImportDeclaration(p)
  );
  return index;
};

const propertyList = [];
const computedNodeList = [];
const methodsList= [];
const watchList = [];
export const traverseOptionsCode = (code) => {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript"],
  });
  traverse(ast, {
    ObjectMethod(path) {
      if (path.node.key.name === "data") {
        try {
          const body = path.node.body.body[0];
          body.argument.properties.forEach((item) => {
            const params = {
              item,
              value: item.value,
            };
            propertyList.push(params);
          });
        } catch (error) {
          console.error("path.node.key.name === 'data'", error);
        }
      }
    },
    ObjectProperty(path) {
      const handleVuex = (item, type) => {
        // if (item.argument.arguments.length === 1 && t.isArrayExpression(item.argument.arguments[0])) {
        //   const actions = item.argument.arguments[0].elements
        //   actions.forEach((item) => {
        //     const computedNode = actionDeclaration(item.value, t.identifier('params'), t.stringLiteral(item.value), type)
        //     // path.parentPath.parentPath.container.push(computedNode)
        //     computedNodeList.push(computedNode)
        //   })
        // }
        // if (item.argument.arguments.length === 1 && t.isObjectExpression(item.argument.arguments[0])) {
        //   const actions = item.argument.arguments[0].properties
        //   actions.forEach((item) => {
        //     const key = item.key?.name
        //     const value = item.value.value || item.value.name
        //     const computedNode = actionDeclaration(key, t.identifier('params'), t.stringLiteral(value), type)
        //     path.parentPath.parentPath.container.push(computedNode)
        //   })
        // }
        // if (item.argument.arguments.length === 2 && t.isStringLiteral(item.argument.arguments[0]) && t.isArrayExpression(item.argument.arguments[1])) {
        //   const getters = item.argument.arguments[1].elements
        //   const namespace = item.argument.arguments[0].value
        //   getters.forEach((item) => {
        //     const computedNode = actionDeclaration(item.value, t.identifier('params'), t.stringLiteral(`${namespace}/${item.value}`), type)
        //     path.parentPath.parentPath.container.push(computedNode)
        //   })
        // }
        // if (item.argument.arguments.length === 2 && t.isStringLiteral(item.argument.arguments[0]) && t.isObjectExpression(item.argument.arguments[1])) {
        //   const actions = item.argument.arguments[1].properties
        //   const namespace = item.argument.arguments[0].value
        //   actions.forEach((item) => {
        //     const actionsNode = actionDeclaration(item.value.value || item.value.name, t.identifier('params'), t.stringLiteral(`${namespace}/${item.value.value || item.value.name}`), type)
        //     path.parentPath.parentPath.container.push(actionsNode)
        //   })
        // }
      };

      try {
        if (path.node.key.name === "methods") {
          path.node.value.properties.forEach((item) => {
            if (
              t.isSpreadElement(item) &&
              t.isCallExpression(item.argument) &&
              item.argument.callee.name === "mapActions"
            ) {
              handleVuex(item);
            } else if (
              t.isSpreadElement(item) &&
              t.isCallExpression(item.argument) &&
              item.argument.callee.name === "mapMutations"
            ) {
              handleVuex(item, t.identifier("commit"));
            } else {
              const newNode = t.variableDeclaration("const", [
                t.variableDeclarator(
                  t.identifier(item.key.name),
                  t.arrowFunctionExpression(item.params, item.body, item.async)
                ),
              ]);
              methodsList.push(newNode);
              // path.parentPath.parentPath.container.push(newNode)
            }
          });
        }
      } catch (error) {
        console.error("path.node.key.name === 'methods'", error);
      }
      if (path.node.key.name === "computed") {
        path.node.value.properties?.forEach((item) => {
          if (
            t.isSpreadElement(item) &&
            t.isCallExpression(item.argument) &&
            item.argument.callee.name === "mapGetters"
          ) {
            if (item.argument.arguments.length === 1) {
              const getters = item.argument.arguments[0].elements;
              getters.forEach((item) => {
                refOrComputedProperty.add(item.value);
                const computedNode = stateDeclaration(
                  item.value,
                  t.identifier("getters"),
                  t.stringLiteral(item.value)
                );
                computedNodeList.push(computedNode);
              });
            }
            if (
              item.argument.arguments.length === 2 &&
              t.isStringLiteral(item.argument.arguments[0])
            ) {
              const getters = item.argument.arguments[1].elements;
              const namespace = item.argument.arguments[0].value;
              getters.forEach((item) => {
                refOrComputedProperty.add(item.value);
                const computedNode = stateDeclaration(
                  item.value,
                  t.identifier("getters"),
                  t.stringLiteral(`${namespace}/${item.value}`)
                );
                computedNodeList.push(computedNode);
              });
            }
          }
        });
      }
      if (path.node.key.name === "watch") {
        path.node.value.properties.forEach((item) => {
          if (t.isObjectProperty(item)) {
            const watchCallback = t.arrowFunctionExpression(
              [t.identifier("newData")],
              t.cloneNode(item.value.body)
            );
            const watchOptions = t.objectExpression([
              t.objectProperty(t.identifier("deep"), t.booleanLiteral(true)),
              t.objectProperty(
                t.identifier("immediate"),
                t.booleanLiteral(true)
              ),
            ]);
            const watchCall = t.callExpression(t.identifier("watch"), [
              t.arrowFunctionExpression(
                [],
                t.memberExpression(item.key, t.identifier("value"))
              ),
              watchCallback,
              watchOptions,
            ]);
            watchList.push(watchCall);
          } else {
            const watchCallback = t.arrowFunctionExpression(
              [t.identifier("newData")],
              t.cloneNode(item.body)
            );
            const watchOptions = t.objectExpression([
              t.objectProperty(t.identifier("deep"), t.booleanLiteral(true)),
              t.objectProperty(
                t.identifier("immediate"),
                t.booleanLiteral(true)
              ),
            ]);
            const watchCall = t.callExpression(t.identifier("watch"), [
              t.arrowFunctionExpression(
                [],
                t.memberExpression(item.key, t.identifier("value"))
              ),
              watchCallback,
              watchOptions,
            ]);
            watchList.push(watchCall);
          }
        });
      }

      // if (path.node.key.name === 'props') {
      //   const propsValue = path.node.value
      //   propsValue.properties.forEach((item: { key: { name: unknown } }) => {
      //     propsProperty.add(item.key.name)
      //   })
      //   const definePropsCallExpression = t.callExpression(t.identifier('defineProps'), [propsValue])
      //   const props = t.variableDeclaration('const', [t.variableDeclarator(t.identifier('props'), definePropsCallExpression)])
      //   path.parentPath.parentPath.container.splice(1, 0, props)
      // }
    },
  });

  const emitList = new Set();
  traverse(ast, {
    MemberExpression(path) {
      if (t.isThisExpression(path.node.object)) {
        if (refOrComputedProperty.has(path.node.property.name)) {
          path.node.object = t.identifier(path.node.property.name);
          path.node.property.name = "value";
        } else if (propsProperty.has(path.node.property.name)) {
          path.node.object = t.identifier("props");
        } else if (path.node.property.name === "$emit") {
          path.replaceWith(t.identifier("$emit"));
          emitList.add(path.parentPath.node.arguments[0].value);
        } else {
          path.replaceWith(t.identifier(path.node.property.name));
        }
      }
    },
    Program(path) {
      const lastIndex = findBodyLastIndex(path);

      const useXXXBody = t.blockStatement([]);
      const returnList = [];
      // const returnStatement = t.returnStatement(
      //   t.objectExpression([]),
      // )
      propertyList.forEach((item) => {
        // path.node.body.splice(lastIndex + index + 1, 0, createProp(item))
        useXXXBody.body.push(createProp(item));
        returnList.push(item.item.key);
      });
      computedNodeList.forEach((item) => {
        useXXXBody.body.push(item);
        returnList.push(item.id);
      });
      methodsList.forEach((item) => {
        useXXXBody.body.push(item);
        returnList.push(item.declarations[0].id);
      });
      watchList.forEach((item) => {
        useXXXBody.body.push(item);
      });
      console.log(returnList);
      useXXXBody.body.push(
        t.returnStatement(
          t.objectExpression(
            returnList
              .filter((item) => item)
              .map((item) => t.objectProperty(item, item))
          )
        )
      );

      const createUseXXX = () => {
        return t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier("useXXX"),
            t.arrowFunctionExpression([], useXXXBody)
          ),
        ]);
      };

      path.node.body.splice(lastIndex + 1, 0, createUseXXX());
    },
  });

  //   traverse(ast, {
  //     ExportDefaultDeclaration(path) {
  //       path.remove()
  //     },
  //     Program(path) {
  //       const body = path.node.body
  //       const importList: t.ImportDeclaration[] = []
  //       const refList: t.VariableDeclaration[] = []
  //       const watchList: t.ExpressionStatement[] = []
  //       const computedList: t.VariableDeclaration[] = []
  //       const methodList: t.VariableDeclaration[] = []
  //       const onMountedList: t.ExpressionStatement[] = []
  //       const definePropsList: (t.ExpressionStatement | t.VariableDeclaration)[] = []

  //       body.forEach((item) => {
  //         if (t.isImportDeclaration(item))
  //           importList.push(item)

  //         if (t.isVariableDeclaration(item)) {
  //           const declarations = item.declarations
  //           if (
  //             declarations
  //             && declarations[0]
  //             && declarations[0].init
  //           ) {
  //             if (t.isCallExpression(declarations[0].init)) {
  //               if (declarations[0].init.callee.name === 'ref')
  //                 refList.push(item)

  //               if (declarations[0].init.callee.name === 'computed')
  //                 computedList.push(item)

  //               if (declarations[0].init.callee.name === 'defineProps')
  //                 definePropsList.push(item)
  //             }
  //             if (t.isArrowFunctionExpression(declarations[0].init))
  //               methodList.push(item)
  //           }
  //         }
  //         if (t.isExpressionStatement(item)) {
  //           if (t.isCallExpression(item.expression) && item.expression.callee.name === 'watch')
  //             watchList.push(item)

  //           if (t.isCallExpression(item.expression) && ['onMounted', 'onShow', 'onLoad', 'onUnload'].includes(item.expression.callee.name))
  //             onMountedList.push(item)

  //           if (t.isCallExpression(item.expression) && item.expression.callee.name === 'defineProps')
  //             definePropsList.push(item)
  //         }
  //         if (t.isCallExpression(item)) {
  //           if (item.callee.name === 'watch')
  //             watchList.push(item)
  //         }
  //         if (t.isObjectMethod(item)) {
  //           if (['onMounted', 'onShow', 'onLoad', 'onUnload'].includes(item.key.name))
  //             onMountedList.push(item)
  //         }
  //       })
  //       const emitParams = t.arrayExpression([...emitList].map(item => t.stringLiteral(item)))
  //       const defineEmits = t.callExpression(t.identifier('defineEmits'), [emitParams])
  //       const emitAst = t.variableDeclaration('const', [t.variableDeclarator(t.identifier('$emit'), defineEmits)])
  //       path.node.body = [...importList, emitAst, ...definePropsList, ...refList, ...computedList, ...methodList, ...watchList, ...onMountedList]
  //     },
  //   })

  const result = new generator.CodeGenerator(
    ast,
    {
      jsescOption: { minimal: true },
    },
    code
  ).generate();

  if (!result.code)
    console.error("replaceClassPropertyToRefOrReactive: 转换出错");

  return result.code || "";
};
