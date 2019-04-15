const nsfw = require('../src/');
const path = require('path');
const fse = require('fs-extra');
const exec = require('executive');

jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

const DEBOUNCE = 1000;
const TIMEOUT_PER_STEP = 3000;

describe('Node Sentinel File Watcher', function() {
  const workDir = path.resolve('./mockfs');

  beforeEach(function(done) {
    function makeDir(identifier) {
      return fse.mkdir(path.join(workDir, 'test' + identifier))
        .then(() => fse.mkdir(path.join(workDir, 'test' + identifier, 'folder' + identifier)))
        .then(() => fse.open(path.join(workDir, 'test' + identifier, 'testing' + identifier +'.file'), 'w'))
        .then(fd => {
          return fse.write(fd, 'testing')
            .then(() => fd);
        })
        .then(fd => fse.close(fd));
    }
    // create a file System
    return fse.stat(workDir)
      .then(() => fse.remove(workDir), () => {})
      .then(() => fse.mkdir(workDir))
      .then(() => {
        const promises = [];
        for (let i = 0; i < 10; ++i) {
          promises.push(makeDir(i));
        }
        return Promise.all(promises);
      })
      .then(done);
  });

  afterEach(function(done) {
    return fse.remove(workDir)
      .then(done);
  });

  describe('Basic', function() {
    it('can watch a single file', function(done) {
      const file = 'testing1.file';
      const inPath = path.resolve(workDir, 'test1');
      const filePath = path.join(inPath, file);
      let changeEvents = 0;
      let createEvents = 0;
      let deleteEvents = 0;

      function findEvents(element) {
        if (
          element.action === nsfw.actions.MODIFIED &&
          element.directory === path.resolve(inPath) &&
          element.file === file
        ) {
          changeEvents++;
        } else if (
          element.action === nsfw.actions.CREATED &&
          element.directory === path.resolve(inPath) &&
          element.file === file
        ) {
          createEvents++;
        } else if (
          element.action === nsfw.actions.DELETED &&
          element.directory === path.resolve(inPath) &&
          element.file === file
        ) {
          deleteEvents++;
        }
      }

      let watch;

      return nsfw(
        filePath,
        events => events.forEach(findEvents),
        { debounceMS: 100 }
      )
        .then(_w => {
          watch = _w;
          return watch.start();
        })
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => {
          const fd = fse.openSync(filePath, 'w');
          fse.writeSync(fd, 'Bean bag video games at noon.');
          return fse.close(fd);
        })
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => fse.remove(filePath))
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => {
          const fd = fse.openSync(filePath, 'w');
          fse.writeSync(fd, 'His watch has ended.');
          return fse.close(fd);
        })
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => watch.stop())
        .then(() => {
          expect(changeEvents).toBeGreaterThan(0);
          expect(createEvents).toBe(1);
          expect(deleteEvents).toBe(1);
        })
        .then(done, () =>
          watch.stop().then((err) => done.fail(err)));
    });

    it('can listen for a create event', function(done) {
      const file = 'another_test.file';
      const inPath = path.resolve(workDir, 'test2', 'folder2');
      let eventFound = false;

      function findEvent(element) {
        if (
          element.action === nsfw.actions.CREATED &&
          element.directory === path.resolve(inPath) &&
          element.file === file
        ) {
          eventFound = true;
        }
      }

      let watch;

      return nsfw(
        workDir,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      )
        .then(_w => {
          watch = _w;
          return watch.start();
        })
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => fse.open(path.join(inPath, file), 'w'))
        .then(fd => {
          return fse.write(fd, 'Peanuts, on occasion, rain from the skies.').then(() => fd);
        })
        .then(fd => fse.close(fd))
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => {
          expect(eventFound).toBe(true);
          return watch.stop();
        })
        .then(done, () =>
          watch.stop().then((err) => done.fail(err)));
    });

    it('can listen for a delete event', function(done) {
      const file = 'testing3.file';
      const inPath = path.resolve(workDir, 'test3');
      let eventFound = false;

      function findEvent(element) {
        if (
          element.action === nsfw.actions.DELETED &&
          element.directory === path.resolve(inPath) &&
          element.file === file
        ) {
          eventFound = true;
        }
      }

      let watch;

      return nsfw(
        workDir,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      )
        .then(_w => {
          watch = _w;
          return watch.start();
        })
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => fse.remove(path.join(inPath, file)))
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => {
          expect(eventFound).toBe(true);
          return watch.stop();
        })
        .then(done, () =>
          watch.stop().then((err) => done.fail(err)));
    });

    it('can listen for a modify event', function(done) {
      const file = 'testing0.file';
      const inPath = path.resolve(workDir, 'test0');
      let eventFound = false;

      function findEvent(element) {
        if (
          element.action === nsfw.actions.MODIFIED &&
          element.directory === path.resolve(inPath) &&
          element.file === file
        ) {
          eventFound = true;
        }
      }

      let watch;

      return nsfw(
        workDir,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      )
        .then(_w => {
          watch = _w;
          return watch.start();
        })
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => fse.open(path.join(inPath, file), 'w'))
        .then(fd => {
          return fse.write(fd, 'At times, sunflower seeds are all that is life.').then(() => fd);
        })
        .then(fd => fse.close(fd))
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => {
          expect(eventFound).toBe(true);
          return watch.stop();
        })
        .then(done, () =>
          watch.stop().then((err) => done.fail(err)));
    });

    it('can run multiple watchers at once', function(done) {
      const dirA = path.resolve(workDir, 'test0');
      const fileA = 'testing1.file';
      const dirB = path.resolve(workDir, 'test1');
      const fileB = 'testing0.file';
      let events = 0;

      function findEvent(element) {
        if (
          element.action === nsfw.actions.CREATED
        ) {
          if (element.directory === dirA && element.file === fileA) {
            events++;
          } else if (element.directory === dirB && element.file === fileB) {
            events++;
          }
        }
      }

      let watchA;
      let watchB;

      return nsfw(
        dirA,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      )
        .then(_w => {
          watchA = _w;
          return watchA.start();
        })
        .then(() => nsfw(
          dirB,
          events => events.forEach(findEvent),
          { debounceMS: DEBOUNCE })
        .then(_w => {
          watchB = _w;
          return watchB.start();
        }))
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => fse.open(path.join(dirA, fileA), 'w'))
        .then(fd => new Promise(resolve => {
          setTimeout(() => resolve(fd), TIMEOUT_PER_STEP);
        }))
        .then(fd => {
          return fse.write(fd, 'At times, sunflower seeds are all that is life.').then(() => fd);
        })
        .then(fd => fse.close(fd))
        .then(() => fse.open(path.join(dirB, fileB), 'w'))
        .then(fd => new Promise(resolve => {
          setTimeout(() => resolve(fd), TIMEOUT_PER_STEP);
        }))
        .then(fd => {
          return fse.write(fd, 'At times, sunflower seeds are all that is life.').then(() => fd);
        })
        .then(fd => fse.close(fd))
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => {
          expect(events).toBe(2);
          return watchA.stop();
        })
        .then(() => watchB.stop())
        .then(done, () =>
          watchA.stop()
            .then(() => watchB.stop())
            .then((err) => done.fail(err)));
    });

    if (process.platform) {
      it('will properly track the movement of watched directories across watched directories', function(done) {
        let watch;

        const performRenameProcedure = number =>
          fse.mkdir(path.join(workDir, `test${number}`, 'sneaky-folder'))
            .then(() => fse.move(
              path.join(workDir, `test${number}`, `folder${number}`),
              path.join(workDir, `test${number + 1}`, 'bad-folder')
            ))
            .then(() => fse.move(
              path.join(workDir, `test${number}`, 'sneaky-folder'),
              path.join(workDir, `test${number}`, 'bad-folder')
            ))
            .then(() => fse.remove(path.join(workDir, `test${number}`)))
            .then(() => fse.remove(path.join(workDir, `test${number + 1}`)));

        return nsfw(workDir, () => {}, { debounceMS: DEBOUNCE })
          .then(_w => {
            watch = _w;
            return watch.start();
          })
          .then(() => new Promise(resolve => {
            setTimeout(resolve, TIMEOUT_PER_STEP);
          }))
          .then(() => Promise.all([
            performRenameProcedure(0),
            performRenameProcedure(2),
            performRenameProcedure(4),
            performRenameProcedure(6),
            performRenameProcedure(8)
          ]))
          .then(() => new Promise(resolve => {
            setTimeout(resolve, TIMEOUT_PER_STEP);
          }))
          .then(() => watch.stop())
          .then(done, () => watch.stop().then((err) => done.fail(err)));
      });
    }
  });

  describe('Recursive', function() {
    it('can listen for the creation of a deeply nested file', function(done) {
      const paths = ['d', 'e', 'e', 'p', 'f', 'o', 'l', 'd', 'e', 'r'];
      const file = 'a_file.txt';
      let foundFileCreateEvent = false;

      function findEvent(element) {
        if (
          element.action === nsfw.actions.CREATED &&
          element.directory === path.join(workDir, ...paths) &&
          element.file === file
        ) {
          foundFileCreateEvent = true;
        }
      }

      let watch;

      let directory = workDir;

      return nsfw(
        workDir,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      )
        .then(_w => {
          watch = _w;
          return watch.start();
        })
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => {
          return paths.reduce((chain, dir) => {
            directory = path.join(directory, dir);
            const nextDirectory = directory;
            return chain.then(() => fse.mkdir(nextDirectory));
          }, Promise.resolve());
        })
        .then(() => fse.open(path.join(directory, file), 'w'))
        .then(fd => fse.close(fd))
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => {
          expect(foundFileCreateEvent).toBe(true);
          return watch.stop();
        })
        .then(done, () =>
          watch.stop().then((err) => done.fail(err)));
    });

    it('can listen for the destruction of a directory and its subtree', function(done) {
      const inPath = path.resolve(workDir, 'test4');
      let deletionCount = 0;

      function findEvent(element) {
        if (element.action === nsfw.actions.DELETED)
        {
          if (element.directory === path.resolve(inPath)
              && (element.file === 'testing4.file' || element.file === 'folder4'))
          {
            deletionCount++;
          }
          else if (element.directory === workDir && element.file === 'test4')
          {
            deletionCount++;
          }
        }
      }

      let watch;

      return nsfw(
        workDir,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      )
        .then(_w => {
          watch = _w;
          return watch.start();
        })
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => fse.remove(inPath))
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => {
          expect(deletionCount).toBeGreaterThan(2);
          return watch.stop();
        })
        .then(done, () =>
          watch.stop().then((err) => done.fail(err)));
    });

    it('does not loop endlessly when watching directories with recursive symlinks', (done) => {
      fse.mkdirSync(path.join(workDir, 'test'));
      fse.symlinkSync(path.join(workDir, 'test'), path.join(workDir, 'test', 'link'));

      let watch;

      return nsfw(
        workDir,
        () => {},
        { debounceMS: DEBOUNCE, errorCallback() {} }
      )
        .then(_w => {
          watch = _w;
          return watch.start();
        })
        .then(() => {
          return watch.stop();
        })
        .then(done, () =>
          watch.stop().then((err) => done.fail(err)));
    });
  });

  describe('Errors', function() {
    it('can gracefully recover when the watch folder is deleted', function(done) {
      const inPath = path.join(workDir, 'test4');
      let erroredOut = false;
      let watch;

      return nsfw(
        inPath,
        () => {},
        { debounceMS: DEBOUNCE, errorCallback() { erroredOut = true; } }
      )
        .then(_w => {
          watch = _w;
          return watch.start();
        })
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => fse.remove(inPath))
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => {
          expect(erroredOut).toBe(true);
          return watch.stop();
        })
        .then(done, () =>
          watch.stop().then((err) => done.fail(err)));
    });
  });

  describe('Stress', function() {
    const stressRepoPath = path.resolve('nsfw-stress-test');

    beforeEach(function(done) {
      return exec('git clone https://github.com/implausible/nsfw-stress-test')
        .then(done);
    });

    it('does not segfault under stress', function(done) {
      let count = 0;
      let watch;
      let errorRestart = Promise.resolve();

      return nsfw(
        stressRepoPath,
        () => { count++; },
        { errorCallback() { errorRestart = watch.stop().then(watch.start); } })
        .then(_w => {
          watch = _w;
          return watch.start();
        })
        .then(() => fse.remove(path.join(stressRepoPath, 'folder')))
        .then(() => errorRestart)
        .then(() => {
          expect(count).toBeGreaterThan(0);
          return watch.stop();
        })
        .then(() => fse.remove(stressRepoPath))
        .then(() => fse.mkdir(stressRepoPath))
        .then(() => nsfw(
          stressRepoPath,
          () => { count++; },
          { errorCallback() { errorRestart = watch.stop().then(watch.start); } }))
        .then(_w => {
          watch = _w;
          count = 0;
          errorRestart = Promise.resolve();
          return watch.start();
        })
        .then(() => new Promise(resolve => setTimeout(resolve, TIMEOUT_PER_STEP)))
        .then(() =>
          exec('git clone https://github.com/implausible/nsfw-stress-test ' + path.join('nsfw-stress-test', 'test')))
        .then(() => fse.stat(path.join(stressRepoPath, 'test')))
        .then(() => fse.remove(path.join(stressRepoPath, 'test')))
        .then(() => errorRestart)
        .then(() => {
          expect(count).toBeGreaterThan(0);
          count = 0;
          return watch.stop();
        })
        .then(done, () =>
          watch.stop().then((err) => done.fail(err)));
    });

    it('creates and destroys many watchers', function(done) {
      let watcher = null;
      let promiseChain = Promise.resolve();

      for (let i = 0; i < 100; i++) {
        promiseChain = promiseChain
          .then(() => nsfw(stressRepoPath, () => {}))
          .then(w => {
            watcher = w;
            return watcher.start();
          })
          .then(() => {
            return watcher.stop();
          });
      }

      promiseChain.then(done, err => done.fail(err));
    });

    afterEach(function(done) {
      return fse.remove(stressRepoPath)
        .then(done);
    });
  });

  describe('Unicode support', function() {
    const watchPath = path.join(workDir, 'は');
    beforeEach(function(done) {
      return fse.mkdir(watchPath)
        .then(done);
    });

    it('supports watching unicode directories', function(done) {
      const file = 'unicoded_right_in_the.talker';
      let eventFound = false;

      function findEvent(element) {
        if (
          element.action === nsfw.actions.CREATED &&
          element.directory === watchPath &&
          element.file === file
        ) {
          eventFound = true;
        }
      }

      let watch;

      return nsfw(
        workDir,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      )
        .then(_w => {
          watch = _w;
          return watch.start();
        })
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => fse.open(path.join(watchPath, file), 'w'))
        .then(fd => {
          return fse.write(fd, 'Unicode though.').then(() => fd);
        })
        .then(fd => fse.close(fd))
        .then(() => new Promise(resolve => {
          setTimeout(resolve, TIMEOUT_PER_STEP);
        }))
        .then(() => {
          expect(eventFound).toBe(true);
          return watch.stop();
        })
        .then(done, () =>
          watch.stop().then((err) => done.fail(err)));
    });
  });
});
