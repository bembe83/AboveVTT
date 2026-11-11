const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../GoDiceIntegration.js'), 'utf8');
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(search = '?abovevtt=true') {
    const devices = [], errors = [], events = {};
    const window = { location: { search }, addEventListener: (name, fn) => { events[name] = fn; } };
    const context = vm.createContext({ window, URLSearchParams, document: { body: {} }, console: {
        error: (...args) => errors.push(args)
    }, GoDiceLibrary: { createGoDice(options) {
        const mount = deferred(), snapshot = deferred();
        const dice = {
            options, settings: { dicebar: {} }, mountCalls: 0, destroyCalls: 0,
            mount() { this.mountCalls++; return mount.promise; },
            destroy() {
                this.destroyCalls++;
                mount.reject(Object.assign(new Error('cancelled'), { code: 'GODICE_CANCELLED' }));
                return snapshot.promise;
            },
            mounted: () => mount.resolve(), saved: () => snapshot.resolve(),
            fail: error => mount.reject(error)
        };
        devices.push(dice);
        return dice;
    } } });
    vm.runInContext(source, context);
    return { api: window.AboveVTTGoDice, devices, errors, events, window, context };
}

(async () => {
    for (const search of ['', '?abovevtt=false', '?other=abovevtt=true']) {
        const ordinary = setup(search);
        await ordinary.api.setEnabled(true);
        await assert.rejects(ordinary.api.ready(), { code: 'GODICE_CANCELLED' });
        ordinary.window.EXPERIMENTAL_SETTINGS = { godiceRoller: true };
        ordinary.events.pageshow({ persisted: true });
        await tick();
        assert.equal(ordinary.devices.length, 0, 'ordinary pages must not mount GoDice');
    }
    const { api, devices, errors, events, window, context } = setup();
    assert.equal(devices.length, 0, 'loading must not connect devices');
    await assert.rejects(api.ready(), { code: 'GODICE_CANCELLED' });
    const first = api.setEnabled(true);
    assert.equal(api.ready(), first);
    await tick();
    assert.equal(devices[0].options.instanceId, 'abovevtt');
    assert.equal(devices[0].mountCalls, 1);
    devices[0].mounted();
    assert.equal(await first, devices[0]);
    // Another extension can replace the global factory without taking ownership.
    context.GoDiceLibrary.createGoDice = () => { throw new Error('foreign factory'); };
    const disabled = api.setEnabled(false);
    assert.equal(devices[0].destroyCalls, 1);
    const second = api.setEnabled(true);
    await tick();
    assert.equal(devices.length, 1, 'reactivation must wait for the storage snapshot');
    devices[0].saved();
    await disabled;
    await tick();
    assert.equal(devices.length, 2);
    // Disable while mounting: cancellation must not wait for mount completion.
    const stopped = api.setEnabled(false);
    assert.equal(devices[1].destroyCalls, 1);
    await assert.rejects(second, { code: 'GODICE_CANCELLED' });
    devices[1].saved();
    await stopped;
    const stale = api.setEnabled(true);
    api.setEnabled(false);
    const final = api.setEnabled(true);
    await assert.rejects(stale, { code: 'GODICE_CANCELLED' });
    await tick();
    assert.equal(devices.length, 3, 'superseded enables must not create runtimes');
    devices[2].mounted();
    await final;
    window.EXPERIMENTAL_SETTINGS = { godiceRoller: true };
    events.pagehide();
    assert.equal(devices[2].destroyCalls, 1);
    devices[2].saved();
    events.pageshow({ persisted: true });
    await tick();
    devices[3].mounted();
    await api.ready();
    assert.equal(window.godice, undefined);
    assert.deepEqual(Array.from(api.matchExpression('12+3-4')), ['12', '+3', '-4']);
    assert.equal(errors.length, 0, 'normal cancellation must not log failures');

    const failed = setup();
    const broken = failed.api.setEnabled(true);
    await tick();
    failed.devices[0].fail(new Error('mount failed'));
    await assert.rejects(broken, /mount failed/);
    assert.equal(failed.devices[0].destroyCalls, 1);
    failed.devices[0].saved();
    const retry = failed.api.ready();
    await tick();
    failed.devices[1].mounted();
    await retry;
    console.log('GoDice integration lifecycle checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
