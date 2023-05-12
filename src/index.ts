#!/usr/bin/env zx
import { fs, question } from "zx";
import log from "log-symbols";
import { resolveCode } from "./core";

export async function main() {
  console.log(log.warning, "如果没有使用git，请注意备份文件");
  const fileName = await question("请输入你需要转换的文件或者文件夹：");
  try {
    const currentWorkingDir = process.cwd();
    const stats = await fs.stat(`${currentWorkingDir}/${fileName}`);
    if (stats.isFile()) {
      const code = await fs.readFile(fileName, "utf8");
      try {
        await fs.writeFile(fileName, resolveCode(code));
        console.log(log.success, `已转换文件 ${fileName}`);
      } catch (error) {
        console.error(`出现错误: ${error}`);
      }
    } else if (stats.isDirectory()) {
      const files = await fs.readdir(fileName);
      files.forEach(async (file: string) => {
        const code = await fs.readFile(`${fileName}/${file}`, "utf8");
        try {
          await fs.writeFile(`${fileName}/${file}`, resolveCode(code));
          console.log(log.success, `已转换文件 ${fileName}/${file}`);
        } catch (error) {
          console.error(`出现错误: ${error}`);
        }
      });
    } else {
      console.log(`未找到指定文件或文件夹: ${fileName}`);
    }
  } catch (error) {
    console.error(`出现错误: ${error}`);
  }
}