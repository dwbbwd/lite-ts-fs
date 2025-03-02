import { join } from 'path';

import { FileFactory } from './file-factory';
import { FileFactoryBase } from './file-factory-base';

const exportReg = /["|'](.*)["|']/;
// 要过滤的行
const ignoreReg = /export\s*\{/;
const importLibrary = /import\s\{([^{}]+)}\sfrom\s'(.+)';/;
const importReg = /import.*["|'](.*)["|']/;

export class JsPack {
    /**
     * 文件工厂
     */
    private m_FsFactory: FileFactoryBase = new FileFactory();

    private m_ImportLibrary: { [library: string]: string[] } = {};

    /**
     * 已解析文件
     */
    private m_ParsedFiles: string[] = [];


    /**
     * 打包
     */
    public async pack() {
        const res = await this.getDirContent('dist');
        Object.entries(this.m_ImportLibrary).forEach(([k, v]) => {
            res.unshift(`import {${v.join(',')}} from "${k}";`);
        })
        const pkg = await this.m_FsFactory.buildFile('package.json').read<{ name: string; }>();
        await this.m_FsFactory.buildFile(`${pkg.name}.d.ts`).write(
            res.join('\n').replace(/export\ /g, '')
                .replace(/moment\.unitOfTime\.StartOf/g, 'string')
        );

        const licenseFile = this.m_FsFactory.buildFile(`${pkg.name}.min.js.LICENSE.txt`);
        const exists = await licenseFile.exists();
        if (exists)
            await licenseFile.remove();
    }

    /**
     * 解析整个目录，从该目录底下的 index.d.ts 的 export 内容一个一个解析过去
     * 
     * @param dirPath 目录地址
     * @returns 
     */
    private async getDirContent(dirPath: string) {
        const indexTsFile = this.m_FsFactory.buildFile(dirPath, 'index.d.ts');
        const dirExists = await indexTsFile.exists();
        if (!dirExists || this.m_ParsedFiles.includes(indexTsFile.path))
            return [];

        this.m_ParsedFiles.push(indexTsFile.path);

        const indexTsFileContent = await indexTsFile.readString();
        const exportsArray = indexTsFileContent.split('\n');
        let content = [];
        for (const line of exportsArray) {
            if (RegExp(ignoreReg).test(line))
                continue;

            const regRes = line.match(exportReg);
            if (regRes?.[1]) {
                const paths = regRes[1].split('/');
                if (!paths[paths.length - 1].endsWith('.d.ts'))
                    paths[paths.length - 1] += '.d.ts';

                const filePath = join(dirPath, ...paths);
                if (this.m_ParsedFiles.includes(filePath))
                    continue;

                this.m_ParsedFiles.push(filePath);

                const file = this.m_FsFactory.buildFile(filePath);
                let fileText = await file.readString();
                const fileContent = await this.getFileContent(fileText, dirPath);
                content.push(...fileContent);
            } else if (line && !RegExp(ignoreReg).test(line)) {
                content.push(line);
            }
        }
        return content;
    }

    /**
     * 获取文件的内容，如果有 import 那么把指定文件的内容拼接起来
     * 
     * @param fileContent 
     * @param dirPath 
     * @returns 
     */
    private async getFileContent(fileContent: string, dirPath: string) {
        const arr = fileContent.split('\n');
        let content = [];
        for (const line of arr) {
            const regRes = line.match(importReg);
            if (regRes?.[1]) {
                const paths = regRes[1].split('/');
                const dirExists = await this.m_FsFactory.buildDirectory(dirPath, ...paths).exists();
                if (dirExists) {
                    const dirContent = await this.getDirContent(join(dirPath, ...paths))
                    content.push(...dirContent);
                } else {
                    if (!paths[paths.length - 1].endsWith('.d.ts'))
                        paths[paths.length - 1] += '.d.ts';

                    const file = this.m_FsFactory.buildFile(dirPath, ...paths);
                    if (this.m_ParsedFiles.includes(file.path))
                        continue;

                    const fileExists = await file.exists();
                    if (!fileExists) {
                        const arr = line.match(importLibrary);
                        if (!arr?.length) {
                            console.log(`无法处理 ${line}, 找不到文件: ${file.path}, 已跳过`);
                            continue;
                        }
                        arr[1].split(',').forEach(r => {
                            this.m_ImportLibrary[arr[2]] ??= [];
                            const index = this.m_ImportLibrary[arr[2]].findIndex(cr => cr == r);
                            if (index == -1)
                                this.m_ImportLibrary[arr[2]].push(r);
                        })
                        continue;
                    }

                    this.m_ParsedFiles.push(file.path);
                    let fileText = await file.readString();
                    if (fileText) {
                        const fileContent = await this.getFileContent(fileText, dirPath);
                        content.push(...fileContent);
                    }
                }
            } else if (line && !RegExp(ignoreReg).test(line)) {
                content.push(line);
            }
        }
        return content;
    }

}