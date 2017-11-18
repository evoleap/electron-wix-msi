import { SpawnOptions } from 'child_process';
import * as fs from 'graceful-fs';
import * as mockFs from 'mock-fs';
import * as os from 'os';
import * as path from 'path';

import { MSICreator } from '../src/creator';
import { getMockFileSystem, root, numberOfFiles } from './fixture/mock-fs';
import { mockSpawn } from './mocks/mock-spawn';

const mockPassedFs = fs;

beforeAll(() => {
  jest.mock('child_process', () => ({
    execSync(name: string) {
      if (name === 'node -v') {
        return new Buffer('8.0.0');
      }

      if (name === 'light -?' || name === 'candle -?' && mockWixInstalled) {
        return new Buffer(' version 3.11.0.1701');
      }

      throw new Error('Command not found');
    },
    spawn(name: string, args: Array<string>, options: SpawnOptions) {
      return new mockSpawn(name, args, options, mockPassedFs);
    }
  }));

  mockFs(getMockFileSystem());
});

afterAll(() => {
  mockFs.restore();
  jest.unmock('child_process');
});

afterEach(() => {
  mockWixInstalled = true;
});

const defaultOptions = {
  appDirectory: root,
  description: 'ACME is the best company ever',
  exe: 'acme',
  name: 'Acme',
  manufacturer: 'Acme Technologies',
  version: '1.0.0',
  outputDirectory: path.join(os.tmpdir(), 'electron-wix-msi-test')
}

const testIncludes = (title: string, ...content: Array<string>) => {
  return test(`.wxs file includes ${title}`, () => {
    if (Array.isArray(content)) {
      content.forEach((innerContent) => {
        expect(wxsContent.includes(innerContent)).toBeTruthy();
      });
    }
  });
}

let wxsContent = '';
let mockWixInstalled = true;

test('MSICreator() can be constructed without errors', () => {
  expect(new MSICreator(defaultOptions)).toBeTruthy();
});

test('MSICreator create() creates a basic Wix file', async () => {
  const msiCreator = new MSICreator(defaultOptions);

  const { wxsFile } = await msiCreator.create();
  wxsContent = fs.readFileSync(wxsFile, 'utf-8');
  expect(wxsFile).toBeTruthy();
});

test('.wxs file has content', () => {
  expect(wxsContent.length).toBeGreaterThan(50);
});

testIncludes('the root element', '<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">');

testIncludes('a package element', '<Package');

testIncludes('an APPLICATIONROOTDIRECTORY', '<Directory Id="APPLICATIONROOTDIRECTORY"');

testIncludes('an ApplicationProgramsFolder', '<Directory Id="ApplicationProgramsFolder"')

test('.wxs file has as many components as we have files', () => {
  // Files + Shortcut
  const count = wxsContent.split('</Component>').length - 1;
  expect(count).toEqual(numberOfFiles + 1);
});

test('.wxs file contains as many component refs as components', () => {
  const comoponentCount = wxsContent.split('</Component>').length - 1;
  const refCount = wxsContent.split('<ComponentRef').length - 1;

  expect(comoponentCount).toEqual(refCount);
});

test('MSICreator compile() throws if candle/light are not installed', async () => {
  mockWixInstalled = false;
  const msiCreator = new MSICreator(defaultOptions);
  expect(msiCreator.compile()).rejects.toEqual(new Error('Could not find light.exe or candle.exe'));
});

test('MSICreator compile() throws if there is no wxsFile', async () => {
  const msiCreator = new MSICreator(defaultOptions);
  expect(msiCreator.compile()).rejects.toEqual(new Error('wxsFile not found. Did you run create() yet?'));
});

test('MSICreator compile() creates a wxsObj file', async () => {
  const msiCreator = new MSICreator(defaultOptions);
  await msiCreator.create();

  const { wxsObjFile } = await msiCreator.compile();

  expect(wxsObjFile).toBeTruthy();
  expect(fs.existsSync(wxsObjFile)).toBeTruthy();
});

test('MSICreator compile() throws if candle fails', async () => {
  const msiCreator = new MSICreator({ ...defaultOptions, exe: 'fail' });
  const err = 'A bit of error';
  const out = 'A bit of data';
  const expectedErr = new Error(`Could not create wxsobj file. Code: 1 StdErr: ${err} StdOut: ${out}`);
  await msiCreator.create();

  expect(msiCreator.compile()).rejects.toEqual(expectedErr);
});
