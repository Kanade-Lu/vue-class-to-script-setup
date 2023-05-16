import { traverseCode } from './traverse'

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

  let lastMatch: string | null = null
  code.replace(regExpFindLastImport, (match: string) => {
    lastMatch = match
    return match
  })
  const nameArr = PropertyList.map(item => item.name)
  const PropsStr = `const { ${nameArr.join(', ')} } = define${something}<{
    ${PropertyList.map(item => `${item.name}: ${item.type ? item.type : 'any'}`).join('\n')}
  }>()`
  if (lastMatch !== null && PropertyList.length !== 0)
    return code.replace(lastMatch, `${lastMatch}\n${PropsStr}`)

  return code
}

const deletePropsAndPushDefineProps = (code: string) => {
  return deleteSomethingAndPushDefineSomething(code, /@Prop\(([\s\S]*?)\)\n?\s*[readonly]?\s*(\w*):?(.*);?/g, 'Props')
}

const deleteModelAndPushDefineModel = (code: string) => {
  return deleteSomethingAndPushDefineSomething(code, /@Model\(([\s\S]*?)\)\n?\s*\s*(\w*)!?:?(.*);?/g, 'Model')
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
  if (shouldAddStore)
    addStore()

  return code
}

const replaceThis = (code: string) => {
  return code.replace(/this\./g, '')
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
    code = code.replace(/(.*)\$refs.(\w+);?/g, (match, p1, p2) => {
      if (!$refSet.has(p2))
        $refSet.add(p2)
      return ''
    })
  }
  $refSet.forEach((item) => {
    code = pushAfterLastImport(code, `const ${item} = ref();`)
  })

  return code
}

export const resolveCode = (code: string) => {
  code = deleteAllClassImport(code)
  code = replaceNormalVariableToRef(code)
  code = replaceNameSpace(code)
  code = deletePropsAndPushDefineProps(code)
  code = deleteModelAndPushDefineModel(code)
  code = replaceScriptToScriptSetup(code)
  code = replaceThis(code)
  code = replaceVueRouter(code)
  code = delete$ref(code)

  return code
}
