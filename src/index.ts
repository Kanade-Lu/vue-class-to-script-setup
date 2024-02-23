#!/usr/bin/env zx
import { fs, question } from "zx";
import log from "log-symbols";
import { resolveCode } from "./core";
import { handleOptions } from './core/options'
import minimist from 'minimist'


const transform = async (currentWorkingDir: string, fileName: string, options = { isTs: false, toPinia: false, onlyTemplate: false}) => {
  try {
    const stats = await fs.stat(`${currentWorkingDir}/${fileName}`);
    if (stats.isFile()) {
      const code = await fs.readFile(`${currentWorkingDir}/${fileName}`, "utf8");
      try {
        await fs.writeFile(fileName, resolveCode(code, options));
        console.log(log.success, `已转换文件 ${fileName}`);
      } catch (error) {
        console.error(`出现错误: ${error}`);
      }
    }
    else if(stats.isDirectory()) {
      const files = await fs.readdir(`${currentWorkingDir}/${fileName}`);
        files.forEach(async (file: string) => {
          const stats = await fs.stat(`${currentWorkingDir}/${fileName}/${file}`);
          if(stats.isFile()) {
            const code = await fs.readFile(`${currentWorkingDir}/${fileName}/${file}`, "utf8");
            try {
              await fs.writeFile(`${currentWorkingDir}/${fileName}/${file}`, resolveCode(code, options));
              console.log(log.success, `已转换文件 ${currentWorkingDir}/${fileName}/${file}`);
            } catch (error) {
              console.error(`出现错误: ${error}`);
            } 
          } else {
            transform(`${currentWorkingDir}/${fileName}`, file, options);
          }
        });
    } else {
      console.error(`未找到指定文件或文件夹: ${fileName}`);
    }
  } catch(error) {
    console.error(`出现错误: ${error}`);
  }
}

export async function main() {
  const argv = minimist(process.argv.slice(3))
  let fileName = argv._[0]
  const toPinia = argv.toPinia
  const onlyTemplate = argv.onlyTemplate || argv.ot
  try {
    const currentWorkingDir = process.cwd();
    transform(currentWorkingDir, fileName, { toPinia, onlyTemplate, isTs: fileName.includes('.ts') });
  } catch (error) {
    console.error(`出现错误: ${error}`);
  }
}


const transformOptions = async (currentWorkingDir: string, fileName: string, options = { isJs: false }) => {
  try {
    const stats = await fs.stat(`${currentWorkingDir}/${fileName}`);
    if (stats.isFile()) {
      const code = await fs.readFile(`${currentWorkingDir}/${fileName}`, "utf8");
      try {
        await fs.writeFile(fileName, handleOptions(code, options.isJs));
        console.log(log.success, `已转换文件 ${fileName}`);
      } catch (error) {
        console.error(`出现错误: ${error}`);
      }
    }
    else if(stats.isDirectory()) {
      const files = await fs.readdir(`${currentWorkingDir}/${fileName}`);
        files.forEach(async (file: string) => {
          const stats = await fs.stat(`${currentWorkingDir}/${fileName}/${file}`);
          if(stats.isFile()) {
            const code = await fs.readFile(`${currentWorkingDir}/${fileName}/${file}`, "utf8");
            try {
              await fs.writeFile(`${currentWorkingDir}/${fileName}/${file}`, handleOptions(code, options.isJs));
              console.log(log.success, `已转换文件 ${currentWorkingDir}/${fileName}/${file}`);
            } catch (error) {
              console.error(`出现错误: ${error}`);
            } 
          } else {
            transformOptions(`${currentWorkingDir}/${fileName}`, file);
          }
        });
    } else {
      console.error(`未找到指定文件或文件夹: ${fileName}`);
    }
  } catch(error) {
    console.error(`出现错误: ${error}`);
  }
}

export async function optionsMain() {
  const argv = minimist(process.argv.slice(3))
  let fileName = argv._[0]
  try {
    const currentWorkingDir = process.cwd();
    transformOptions(currentWorkingDir, fileName, { isJs: fileName.includes('.js')});
  } catch (error) {
    console.error(`出现错误: ${error}`);
  }
}