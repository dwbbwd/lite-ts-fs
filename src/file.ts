import { constants } from 'fs';
import { copyFile, readFile, unlink, writeFile } from 'fs/promises';
import { load } from 'js-yaml';
import { extname, join } from 'path';

import { CopyOption } from './copy-option';
import { FileEntryBase } from './file-entry-base';
import { IFile } from './i-file';

export class File extends FileEntryBase implements IFile {
    private m_Ext: string;
    public get ext() {
        this.m_Ext ??= extname(this.path);
        return this.m_Ext;
    }

    public async moveTo(v: any) {
        const file = v as IFile;
        if (typeof file.moveTo == 'function')
            await file.write(this);
        else
            await super.moveTo(v);
    }

    public async read<T>() {
        const res = await this.readString();
        return JSON.parse(res) as T;
    }

    public async readString() {
        return readFile(this.path, 'utf-8');
    }

    public async readYaml<T>() {
        const res = await this.readString();
        return load(res) as T;
    }

    public async remove() {
        await unlink(this.path);
    }

    public async write(v: any) {
        if (typeof v !== 'string')
            v = JSON.stringify(v);

        await writeFile(this.path, v);
    }

    protected async doCopyTo(opts: CopyOption) {
        await copyFile(
            this.path,
            join(...opts.paths),
            opts.isForce ? 0 : constants.COPYFILE_EXCL
        );
    }
}