// Keep AboveVTT's runtime separate from other integrations on the same page.
(() => {
    if (window.AboveVTTGoDice) return;
    // Capture our factory before another extension loads its own bundle.
    const createGoDice = GoDiceLibrary.createGoDice;
    let runtime;
    let enabled = false;
    let mounting;
    let cleanup = Promise.resolve();
    let generation = 0;
    const isVttPage = () => new URLSearchParams(window.location.search).get('abovevtt') === 'true';

    const cancelled = () => Object.assign(new Error('AboveVTT GoDice disabled'), {
        code: 'GODICE_CANCELLED'
    });
    const report = error => {
        if (error.code !== 'GODICE_CANCELLED') console.error('AboveVTT GoDice:', error);
    };

    function dispose() {
        const previous = runtime;
        runtime = undefined;
        mounting = undefined;
        if (previous) {
            // Cancel immediately, including when mount is still pending.
            const destroyed = previous.destroy();
            cleanup = Promise.all([cleanup, destroyed]).then(() => undefined);
            cleanup.catch(report);
        }
        return cleanup;
    }

    function ready() {
        if (!enabled || !isVttPage()) return Promise.reject(cancelled());
        if (mounting) return mounting;
        const current = generation;
        mounting = (async () => {
            await cleanup;
            if (!enabled || !isVttPage() || current !== generation) throw cancelled();
            const dice = createGoDice({ instanceId: 'abovevtt', container: document.body });
            // Leave the lower-left area free for other integrations' dicebars.
            dice.settings.dicebar.position = { bottom: '-5px', left: '145px' };
            runtime = dice;
            try {
                await dice.mount();
                if (!enabled || !isVttPage() || current !== generation) throw cancelled();
                return dice;
            } catch (error) {
                if (runtime === dice) dispose();
                throw error;
            }
        })();
        mounting.catch(report);
        return mounting;
    }

    function setEnabled(value) {
        // Character pages receive setupObserver too; only the VTT owns Bluetooth/UI.
        const next = value === true && isVttPage();
        if (enabled !== next) {
            enabled = next;
            generation++;
        }
        return enabled ? ready() : dispose();
    }

    window.AboveVTTGoDice = Object.freeze({
        setEnabled,
        ready,
        matchExpression: expression => expression.match(/[+-]{0,1}\d+/g)
    });
    window.addEventListener('pagehide', () => setEnabled(false));
    window.addEventListener('pageshow', event => {
        if (event.persisted) setEnabled(window.EXPERIMENTAL_SETTINGS?.godiceRoller === true);
    });
})();
