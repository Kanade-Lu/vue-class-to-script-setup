import { ComponentProps, addPointValueForToRefs, resetComponentProps, traverseCode } from './traverse'

const regExpFindLastImport = /^(?!@)import.*$/gm
const typeMap = {
  Getter: 'getters',
  Action: 'dispatch',
  State: 'state',
  Mutation: 'commit',
}

const pushAfterScript = (code: string, str: string) => {
  return code.replace(/<script(.*)/, `<script$1\n${str}\n`)
}
const pushAfterLastImport = (code: string, str: string) => {
  const matches = [...code.matchAll(regExpFindLastImport)]
  if(!matches.length) {
    return pushAfterScript(code, str)
  }
  const lastMatch = matches[matches.length - 1]
  if (!lastMatch.index)
    return code
  const newCode = `${code.slice(0, lastMatch!.index + lastMatch[0].length)}\n${str}${code.slice(lastMatch!.index + lastMatch[0].length)}`

  return newCode
}

const deleteSomethingAndPushDefineSomething = (code: string, regexp: RegExp, something: string) => {
  const PropertyList: {
    name: string
    type: string
  }[] = []
  code = code.replace(regexp, (match: any, p1: string, p2: string, p3: string, p4, p5) => {
    PropertyList.push({
      name: p4?.replace(';', ''),
      type: p5,
    })
    return ''
  })
  const nameArr = PropertyList.map(item => item.name)
  let PropsStr = ''
  if (something === 'Props') {
    PropsStr = `const props = define${something}<{
      ${PropertyList.map(item => `${item.name}: ${item.type.replace(';', '') ? item.type : 'any'}`).join('\n')}
    }>()
    const { ${nameArr.join(', ')} } = toRefs(props)
    `
  }
  else {
    PropsStr = `const { ${nameArr.join(', ')} } = define${something}<{
      ${PropertyList.map(item => `${item.name}: ${item.type ? item.type : 'any'}`).join('\n')}
    }>()
    `
  }
  if (!PropertyList.length)
    return code

  return pushAfterLastImport(code, PropsStr)
}

export const addDefineProps = (code: string, PropertyList: { type: string; name: string }[], something: string) => {
  const nameArr = PropertyList.map(item => item.name)
  const PropsStr = `const props = define${something}<{
    ${PropertyList.map(item => `${item.name}: ${item.type ? item.type : 'any'}`).join('\n')}
  }>()
  const { ${nameArr.join(', ')} } = toRefs(props)
  `

 return pushAfterLastImport(code, PropsStr)
}

const deletePropsAndPushDefineProps = (code: string) => {
  return deleteSomethingAndPushDefineSomething(code, /@Prop(Sync)?\(([\s\S]*?)\)\n?\s*(readonly)?\s*(\w*)!?:?(.*);?/g, 'Props')
}

const deleteModelAndPushDefineModel = (code: string) => {
  return deleteSomethingAndPushDefineSomething(code, /@Model\(([\s\S]*?)\)\n?\s*\s*(\w*)!?:?(.*);?/g, 'Model')
}

export const addDefinePropsByComponentProps = (code: string) => {
  return addDefineProps(code, ComponentProps, 'Props')
}

const deleteEmitAndPushDefineEmits = (code: string) => {
  // 收集所有emit
  const emitNameList = [...code.matchAll(/@Emit\('(\w+)'\)/g), ...code.matchAll(/this.\$emit\('(\w+:?\w+?)'.*/g)]
  const emitNameArr = emitNameList.map(item => item[1])
  // 替换掉所有@Emit
  code = code.replace(/@Emit\(([\s\S]*?)\)\n?\s*\s*(\w*).*\n*\s*.*\n*\s*\}/g, '')
  if (emitNameArr.length > 0)
    code = pushAfterLastImport(code, `const emit = defineEmits(${JSON.stringify(emitNameArr)})`)

  return code
}

const deleteAllClassImport = (code: string) => {
  return code
    .replace(/import (.*) from 'vue-property-decorator';?/g, '')
    .replace(/import (.*) from 'vuex-class';?/g, '')
    .replace(/import (.*) from 'vue-facing-decorator';?/g, '')
    .replace('export default ', '')
}

const replaceScriptToScriptSetup = (code: string) => {
  return code.replace(/<script (.*)>/g, (match, p1) => {
    if (!p1.includes('setup'))
      return `<script ${p1} setup>`

    return match
  })
}

export const replaceFunctionToArrowFunction = (code: string) => {
  return code
    .replace(/(\w+)\((\w+: \{)((\n\s*\w*:?\s*\w*;?|\n\s+\})+)\)/g, (match, p1, p2, p3) => {
      return `const ${p1} = (${p2}${p3}) =>`
    })
    .replace(/(?!get)(?!if)\s+(async)? ((?!if)\w+)\s?\((.+)?\) \{/g, '\nconst $2 = $1($3) => {')
}

const addStore = (code: string) => {
  code = code.replace(/<script(.*)/, '<script$1\nimport { useStore } from "vuex"\n')
  code = pushAfterLastImport(code, 'const store = useStore()')
  return code
}
const findVuexAndAddStore = (code: string) => {
  if (code.includes('store.'))
    code = addStore(code)

  return code
}

const replaceNameSpace = (code: string) => {
  const matchList = [] as {
    name: string
    type?: string
    typeTitle: string
  }[]
  code = code.replace(/const (.*) = namespace\('(.*)'\);?/g, (match: string, p1, p2, p3) => {
    if (match) {
      matchList.push({
        typeTitle: p1,
        name: p2,
      })
    }
    return ''
  })
  code = code.replace(/const (.*) = namespace\('(\w+)', (\w+)\);?/g, (match: string, p1, p2, p3, p4, p5) => {
    if (match) {
      matchList.push({
        typeTitle: p1,
        name: p2,
        type: p3,
      })
    }
    return ''
  })
  if (matchList.length > 0) {
    matchList.forEach((item) => {
      const regexp = new RegExp(`@${item.typeTitle || item.type}\\('(.*)'\\)\n?(.*);?`, 'g')
      const regexp2 = new RegExp(`@${item.typeTitle || item.type}(.(Action|Mutation|State|Getter))?\\('(\\w+)'\\)\\n*\\s*(\\w+);?`, 'g')
      if (regexp.test(code)) {
        code = code.replace(regexp, (match, p1, p2) => {
          if (item.type?.includes('Action'))
            return `const ${p1} = (params?) => store.dispatch('${item.name || item.type}/${p1}', params)`

          else if (item.type?.includes('State'))
            return `const ${p1} = store.state.${item.name}.${p1}`

          else if (item.type?.includes('Getter'))
            return `const ${p1} = computed(() => store.getters['${item.name || item.type}/${p1}'])`

          return ''
        })
      }
      else if (regexp2.test(code)) {
        code = code.replace(regexp2, (match, p1: string, p2, p3) => {
          p1 = p1.replace('.', '')
          if (p1 === 'Action')
            return `const ${p3} = (params?) => store.${typeMap[p1]}('${item.name}/${p3}', params)`

          else if (p1 === 'State')
            return `const ${p3} = store.${typeMap[p1]}.${item.name}.${p2}`

          else if (p1 === 'Getter')
            return `const ${p3} = computed(() => store.${typeMap[p1]}[${item.name}/${p3}])`
          else if (p1 === 'Mutation')
            return `const ${p3} = (params?) => store.${typeMap[p1]}('${item.name}/${p3}', params)`

          return ''
        })
      }
    })
  }

  return code
}

const replaceThis = (code: string) => {
  return code.replace(/this\.\$?/g, '')
}

const replaceVueRouter = (code: string) => {
  let haveRouter = false
  let haveRoute = false
  code = code.replace(/(this.)?\$(router|route)/g, (match) => {
    if (match.includes('$router')) {
      haveRouter = true
      return 'router'
    }
    if (match.includes('$route')) {
      haveRoute = true
      return 'route'
    }
    return ''
  })

  if (haveRouter || haveRoute) {
    code = pushAfterScript(code, 'import { useRouter, useRoute } from "vue-router/composables"')

    if (haveRoute)
      code = pushAfterLastImport(code, 'const route = useRoute()')

    if (haveRouter)
      code = pushAfterLastImport(code, 'const router = useRouter()')
  }

  return code
}

export const replaceNormalVariableToRef = (code: string, func: Function) => {
  return code.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, (match, p1) => {
    return `<script lang="ts">\n${func(p1)}\n</script>`
  })
}

const regExpFor$ref = /(.*)\$refs.(.*)/
const delete$ref = (code: string) => {
  const $refSet = new Set()
  if (regExpFor$ref.test(code)) {
    code = code.replace(/(.*)\$refs.(\w+)(.*);?/g, (match, p1, p2) => {
      if (!$refSet.has(p2))
        $refSet.add(p2)
      return ''
    })
  }
  $refSet.forEach((item) => {
    code = code.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, (match, p1) => {
      return `<script lang="ts">\n${p1.replace(new RegExp(`${item}`, 'g'), `${item}.value`)}\n</script>`
    })
    code = pushAfterLastImport(code, `const ${item} = ref();`)
  })

  return code
}

export const replaceUpperMessage = (code: string) => {
  // replace message.error message.info message.success message.warning to Message.error Message.info Message.success Message.warning
  let hasMessage = false
  code = code.replace(/message\.(error|info|success|warning)/g, (match, p1) => {
    hasMessage = true
    return `Message.${p1}`
  })
  if(hasMessage) {
    code = pushAfterLastImport(code, 'import { Message } from "element-ui"')
  }
  
  return code
}



/**
 * replace
 *
 *  const getSessionConfigList = (params?) => store.dispatch("secretAuction/getSessionConfigList", params)
 *  const disableSessionConfig = (params?) => store.dispatch("secretAuction/disableSessionConfig", params)
 *  const sessionList = computed(() => store.getters["secretAuction/sessionConfigList"])
 *  const totalNum = computed(() => store.getters["secretAuction/sessionConfigListTotalCount"])
 *  const loading = computed(() => store.getters["secretAuction/sessionConfigListLoading"])
 *
 * to
 *
 *  const secretAuctionStore = useSecretAuctionStore()
 *  const { getSessionConfigList, disableSessionConfig } = secretAuctionStore
 *  const { sessionConfigList: sessionList, sessionConfigListTotalCount: totalNum, sessionConfigListLoading: loading } = storeToRefs(secretAuctionStore)
 *
 */

function replaceVuexToPinia(code: string) {
  const nameSpaceList: Record<string, string> = {}

  const allDispatchRegex = /const (\w+) = \(params\?\) => store.dispatch\(['|"](\w+)\/(\w+)['|"], params\)/g
  const dispatchList: {
    key: string
    storeKey: string
    nameSpace?: string
  }[] = []
  code = code.replace(allDispatchRegex, (match, p1, p2, p3) => {
    dispatchList.push({
      key: p1,
      storeKey: p3,
      nameSpace: p2,
    })
    if (!(p2 in nameSpaceList))
      nameSpaceList[p2] = `use${p2.charAt(0).toUpperCase() + p2.slice(1)}Store`

    return ''
  })

  const allComputedRegex = /const (\w+) = computed\(\(\) => store.getters\[['|"](\w+)\/(\w+)['|"]\]\)/g
  const computedList: {
    key: string
    storeKey: string
    nameSpace?: string
  }[] = []
  code = code.replace(allComputedRegex, (match, p1, p2, p3) => {
    computedList.push({
      key: p1,
      storeKey: p3,
      nameSpace: p2,
    })
    if (!(p2 in nameSpaceList))
      nameSpaceList[p2] = `use${p2.charAt(0).toUpperCase() + p2.slice(1)}Store`

    return ''
  })

  if (Object.keys(nameSpaceList).length > 0)
    code = pushAfterLastImport(code, 'import { storeToRefs } from "pinia"')

  Object.keys(nameSpaceList).forEach((key) => {
    const storeName = `${key}Store`
    const dispatchStr = dispatchList.filter(item => item.nameSpace === key).reduce((prev, curv) => {
      const newDispatch = curv.key !== curv.storeKey ? `${curv.storeKey}: ${curv.key}` : `${curv.storeKey}`
      return prev ? `${prev}, ${newDispatch}` : `${newDispatch}`
    }, '')

    const computedStr = computedList.filter(item => item.nameSpace === key).reduce((prev, curv) => {
      const newComputed = curv.key !== curv.storeKey ? `${curv.storeKey}: ${curv.key}` : `${curv.storeKey}`
      return prev ? `${prev}, ${newComputed}` : `${newComputed}`
    }, '')

    code = pushAfterLastImport(code,
      `
const ${storeName} = ${nameSpaceList[key]}()
const { ${dispatchStr} } = ${storeName}
const { ${computedStr} } = storeToRefs(${storeName})
`,
    )
  })

  return code
}

export const resolveCode = (code: string, { isTs = false, toPinia = false, onlyTemplate = false, onlyScript = false }) => {
  code = deleteAllClassImport(code)
  if (isTs)
    code = traverseCode(code)
  else
    code = replaceNormalVariableToRef(code, traverseCode)

  code = replaceNameSpace(code)
  code = deleteEmitAndPushDefineEmits(code)
  code = findVuexAndAddStore(code)
  if (ComponentProps.length > 0) {
    code = addDefinePropsByComponentProps(code)
    resetComponentProps()
  }
  else
    code = deletePropsAndPushDefineProps(code)
  if (isTs)
    code = traverseCode(code)
  else
    code = replaceNormalVariableToRef(code, addPointValueForToRefs)
  code = deleteModelAndPushDefineModel(code)
  code = replaceScriptToScriptSetup(code)
  code = replaceVueRouter(code)
  code = replaceThis(code)
  code = delete$ref(code)
  code = replaceUpperMessage(code)

  if(toPinia) {
    code = replaceVuexToPinia(code)
  }
  
  return code
}
