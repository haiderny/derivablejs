import {captureParent, captureEpoch, capturingParentsEpochs} from './parents'
import {addToArray, removeFromArray} from './util';

let globalEpoch = 0;

export interface Derivable<T> {
  get(): T;
  derive<E>(f: (t:T) => E): Derivable<E>;
  reactor(f: (t: T) => void): Reactor<T>;
  epoch: number;
}

export class Atom<T> implements Derivable<T> {
  value: T;
  epoch: number;
  reactors: any[];
  constructor(init: T) {
    this.value = init;
    this.epoch = 0;
    this.reactors = [];
  }
  reactor(f) {
    return new Reactor(this, f);
  }
  get() {
    captureEpoch(captureParent(this), this.epoch);
    return this.value;
  }
  _update() {

  }
  derive(f) {
    return new Derivation(() => f(this.get()));
  }
  set(value: T) {
    if (value !== this.value) {
      globalEpoch++;
      this.epoch++;
      this.value = value;
      this.reactors.forEach(r => r.maybeReact());
    }
  }
}

const EMPTY = Object.freeze({});

class Derivation<T> implements Derivable<T> {
  cache: T;
  epoch: number;
  lastGlobalEpoch: number;
  lastParentsEpochs: any[];
  deriver: () => T;
  constructor(deriver: () => T) {
    this.deriver = deriver;
    this.cache = <T>EMPTY;
    this.lastGlobalEpoch = globalEpoch - 1;
    this.epoch = 0;
  }
  reactor(f) {
    return new Reactor(this, f);
  }
  derive(f) {
    return new Derivation(() => f(this.get()));
  }
  _forceEval() {
    let newVal = null;
    const parents = capturingParentsEpochs(() => {
      newVal = this.deriver();
    });

    console.log("mm new val", newVal);

    this.lastParentsEpochs = parents;

    if (newVal !== this.cache) {
      this.epoch++;
    }
    this.cache = newVal;
  }
  _update() {
    if (this.lastGlobalEpoch === globalEpoch) {
      // do nothing
    } else if (this.cache === EMPTY) {
      // touched for the very first time
      this._forceEval();
    } else {
      // check parent epochs
      for (var i = 0, len = this.lastParentsEpochs.length; i < len; i+=2) {
        const parent = this.lastParentsEpochs[i];
        const lastParentEpoch = this.lastParentsEpochs[i+1];

        parent._update();
        if (parent.epoch !== lastParentEpoch) {
          this._forceEval();
          break;
        }
      }
    }
  }
  get() {
    const idx = captureParent(this);
    this._update();
    captureEpoch(idx, this.epoch);
    return this.cache;
  }
}

function descend(derivable, reactor) {
  if (derivable instanceof Atom) {
    addToArray(derivable.reactors, reactor);
    addToArray(reactor.atoms, derivable);
  } else {
    for (var i = 0, len = derivable.lastParentsEpochs.length; i < len; i+=2) {
      descend(derivable.lastParentsEpochs[i], reactor);
    }
  }
}

class Reactor<T> {
  derivable: Derivable<T>
  lastValue: null;
  react: (t: T) => void;
  atoms: Atom<any>[];
  constructor(derivable: Derivable<T>, react: (t: T) => void) {
    this.derivable = derivable;
    this.react = react;
    this.atoms = [];
  }
  start() {
    this.lastValue = this.derivable.get();
    this.atoms = [];
    descend(this.derivable, this);
  }
  maybeReact() {
    const nextValue = this.derivable.get();
    console.log('next', nextValue, this.lastValue);
    if (nextValue !== this.lastValue) {
      (<any>this.react).call(null, nextValue);
    }
    this.lastValue = nextValue;
  }
  stop() {
    this.atoms.forEach(atom => removeFromArray(atom.reactors, this));
    this.atoms = [];
  }
}
