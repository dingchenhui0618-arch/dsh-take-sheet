// Client-contract test: load the generated bundle the way __ModuleLoader__
// does, then apply it against a stub slot registry. This catches a broken
// bundle or a wrong slot id without launching the GUI.

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'lib', 'client.js'), 'utf8')

function loadBundle() {
  let spec
  const window = { __ModuleLoader__: { load(value) { spec = value } } }
  new Function('window', source)(window)
  assert.ok(spec, 'bundle called window.__ModuleLoader__.load')
  const React = {
    createElement() { return {} },
    useState() { return [null, function () {}] },
    useEffect() {},
  }
  const module = spec.factory(function (name) {
    if (name === 'react') return React
    throw new Error('unexpected require: ' + name)
  })
  return { spec, module }
}

test('the generated client bundle declares the plugin and its slot injection', () => {
  const { spec, module } = loadBundle()
  assert.equal(spec.id, 'dsh-take-sheet')
  assert.equal(module.name, 'dsh-take-sheet')
  assert.deepEqual(module.inject, ['slots'])
  assert.equal(typeof module.apply, 'function')
})

test('apply registers one conversation view and unload removes its style', () => {
  const { module } = loadBundle()
  const effects = []
  const registered = []
  const removed = []
  const fakeDocument = {
    createElement() {
      return {
        dataset: {},
        textContent: '',
        remove() { removed.push('style') },
      }
    },
    head: { appendChild() {} },
  }
  const previous = globalThis.document
  globalThis.document = fakeDocument
  try {
    module.apply({
      effect(fn) { effects.push(fn()) },
      slots: {
        inject(name, factory) {
          assert.equal(name, 'conversation.view')
          factory()
        },
        register(options, view) {
          registered.push({ options, view })
          return function () {}
        },
      },
    })
  } finally {
    globalThis.document = previous
  }

  assert.equal(registered.length, 1)
  assert.equal(registered[0].options.name, 'conversation.view')
  assert.equal(registered[0].options.id, 'take-sheet')
  assert.equal(registered[0].options.label, '参考帧')
  assert.equal(registered[0].options.order, 45)
  assert.equal(typeof registered[0].view, 'function')

  effects.forEach(function (dispose) { if (typeof dispose === 'function') dispose() })
  assert.deepEqual(removed, ['style'])
})
