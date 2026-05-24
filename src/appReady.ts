let _ready = false
const _waiting: (() => void)[] = []

export function isAppReady() {
  return _ready
}

export function signalAppReady() {
  if (_ready) return
  _ready = true
  _waiting.forEach(fn => fn())
  _waiting.length = 0
}

export function onAppReady(fn: () => void) {
  if (_ready) {
    fn()
  } else {
    _waiting.push(fn)
  }
}
