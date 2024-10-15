import { createUseXXX, traverseCode } from './options-traverse.js'
import { traverseOptionsCode } from './options-ts.traverse.js'

const replaceScriptToScriptSetup = (code: string) => {
  return code.replace(/<script (.*)>/g, (match: any, p1: string | string[]) => {
    if (!p1.includes('setup'))
      return '<script>'

    return match
  })
}

export const replaceNormalVariableToRef = (code: string, func: (arg0: any) => any): string => {
  return code.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, (match: any, p1: any) => {
    return `<script lang="ts" setup>\n${func(p1)}\n</script>`
  })
}

export const handleOptions = (code: string, isTs = false, isJs = false) => {
  if (isTs) {
    code = traverseCode(code)
    code = createUseXXX(code)
  }
  if(isJs) {
    code = traverseOptionsCode(code)
  }



  else { code = replaceNormalVariableToRef(code, traverseCode) }

  code = replaceScriptToScriptSetup(code)
  return code
}
