import { ComponentProps, traverseCode } from './traverse'

const regExpFindLastImport = /^(?!@)import.*$/gm
const typeMap = {
  Getter: 'getters',
  Action: 'dispatch',
  State: 'state',
}
const pushAfterLastImport = (code: string, str: string) => {
  const matches = [...code.matchAll(regExpFindLastImport)]
  const lastMatch = matches[matches.length - 1]
  if (!lastMatch.index)
    return code
  const newCode = `${code.slice(0, lastMatch!.index + lastMatch[0].length)}\n${str}${code.slice(lastMatch!.index + lastMatch[0].length)}`

  return newCode
}
const pushAfterScript = (code: string, str: string) => {
  return code.replace(/<script(.*)/, `<script$1\n${str}\n`)
}

const deleteSomethingAndPushDefineSomething = (code: string, regexp: RegExp, something: string) => {
  const PropertyList: {
    name: string
    type: string
  }[] = []
  code = code.replace(regexp, (match: any, p1: string, p2: string, p3: string) => {
    PropertyList.push({
      name: p2.replace(';', ''),
      type: p3,
    })
    return ''
  })
  const nameArr = PropertyList.map(item => item.name)
  let PropsStr = ''
  if (something === 'Props') {
    PropsStr = `const props = define${something}<{
      ${PropertyList.map(item => `${item.name}: ${item.type ? item.type : 'any'}`).join('\n')}
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
  if (regExpFindLastImport.test(code)) {
    return code.replace(regExpFindLastImport, (match: string) => {
      return `${match}\n${PropsStr}`
    })
  }
  else {
    return pushAfterScript(code, PropsStr)
  }
}

export const addDefineProps = (code: string, PropertyList: { type: string; name: string }[], something: string) => {
  const nameArr = PropertyList.map(item => item.name)
  const PropsStr = `const props = define${something}<{
    ${PropertyList.map(item => `${item.name}: ${item.type ? item.type : 'any'}`).join('\n')}
  }>()
  const { ${nameArr.join(', ')} } = toRefs(props)
  `

  if (regExpFindLastImport.test(code)) {
    return code.replace(regExpFindLastImport, (match: string) => {
      return `${match}\n${PropsStr}`
    })
  }
  else {
    return pushAfterScript(code, PropsStr)
  }
}

const deletePropsAndPushDefineProps = (code: string) => {
  return deleteSomethingAndPushDefineSomething(code, /@Prop\(([\s\S]*?)\)\n?\s*[readonly]?\s*(\w*):?(.*);?/g, 'Props')
}

const deleteModelAndPushDefineModel = (code: string) => {
  return deleteSomethingAndPushDefineSomething(code, /@Model\(([\s\S]*?)\)\n?\s*\s*(\w*)!?:?(.*);?/g, 'Model')
}

export const addDefinePropsByComponentProps = (code: string) => {
  return addDefineProps(code, ComponentProps, 'Props')
}

const deleteEmitAndPushDefineEmits = (code: string) => {
  // 收集所有emit
  const emitNameList = [...code.matchAll(/@Emit\('(\w+)'\)/g)]
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

const replaceNameSpace = (code: string) => {
  const matchList = [] as {
    name: string
    type: string
    typeTitle: string
  }[]
  // 拿掉所有 const $1 = namespace('$2', $3)
  code = code.replace(/const (.*) = namespace\('(.*)', (.*)\);?/g, (match: string, p1, p2, p3) => {
    if (match) {
      matchList.push({
        typeTitle: p1,
        name: p2,
        type: p3,
      })
    }
    return ''
  })
  const addStore = () => {
    code = code.replace(/<script(.*)/, '<script$1\nimport { useStore } from "vuex"\n')
    code = pushAfterLastImport(code, 'const store = useStore()')
  }
  let shouldAddStore = false

  if (matchList.length > 0) {
    shouldAddStore = true
    matchList.forEach((item) => {
      const regexp = new RegExp(`@${item.typeTitle}\\('(.*)'\\)\n?(.*);?`, 'g')
      code = code.replace(regexp, (match, p1, p2) => {
        if (item.type === 'Action')
          return `const ${p1} = (params?) => store.${typeMap[item.type]}('${item.name}/${p1}', params)`

        else if (item.type === 'State')
          return `const ${p1} = store.${typeMap[item.type]}.${item.name}.${p1}`

        else if (item.type === 'Getter')
          return `const ${p1} = computed(() => store.${typeMap[item.type]}[${item.name}/${p1}])`

        return ''
      })
    })
  }

  if (['@Action', '@Getter', '@State'].some(item => code.includes(item))) {
    shouldAddStore = true
    code = code.replace(/@(Action|Getter|State)\('(.*)'\)\n?\s+(.*);?/g, (match, p1: 'Action' | 'Getter' | 'State', p2) => {
      const propertyName = p2.includes('/') ? p2.split('/')[1] : p2
      if (p1 === 'Action')
        return `const ${propertyName} = (params?) => store.${typeMap[p1]}('${p2}', params)`

      else if (p1 === 'State')
        return `const ${propertyName} = store.${typeMap[p1]}.${p2}`

      else if (p1 === 'Getter')
        return `const ${propertyName} = computed(() => store.${typeMap[p1]}.${p2})`

      return match
    })
  }

  const regexp = /const \w+ = (.*) => store.(.*)/
  if (regexp.test(code))
    shouldAddStore = true

  if (shouldAddStore)
    addStore()

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
    code = pushAfterScript(code, 'import { useRouter, useRoute } from "vue-router"')

    if (haveRoute)
      code = pushAfterLastImport(code, 'const route = useRoute()')

    if (haveRouter)
      code = pushAfterLastImport(code, 'const router = useRouter()')
  }

  return code
}

export const replaceNormalVariableToRef = (code: string) => {
  return code.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, (match, p1) => {
    return `<script lang="ts">\n${traverseCode(p1)}\n</script>`
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

export const resolveCode = (code: string) => {
  code = deleteAllClassImport(code)
  code = replaceNormalVariableToRef(code)
  code = deleteEmitAndPushDefineEmits(code)
  code = replaceNameSpace(code)
  if (ComponentProps.length > 0)
    code = addDefinePropsByComponentProps(code)

  else
    code = deletePropsAndPushDefineProps(code)

  code = deleteModelAndPushDefineModel(code)
  code = replaceScriptToScriptSetup(code)
  code = replaceThis(code)
  code = replaceVueRouter(code)
  code = delete$ref(code)

  return code
}
