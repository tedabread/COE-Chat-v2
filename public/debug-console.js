(function () {
  'use strict'

  var C = {
    base: '#1e1e2e',
    mantle: '#181825',
    crust: '#11111b',
    surface0: '#313244',
    surface1: '#45475a',
    overlay0: '#6c7086',
    text: '#cdd6f4',
    subtext0: '#a6adc8',
    red: '#f38ba8',
    yellow: '#f9e2af',
    green: '#a6e3a1',
    blue: '#89b4fa',
    peach: '#fab387',
    mauve: '#cba6f7',
  }

  var MAX = 300
  var TRIM = 50
  var entries = []
  var open = false
  var overlay = null
  var autoScroll = true
  var idCounter = 0

  var origLog = console.log.bind(console)
  var origWarn = console.warn.bind(console)
  var origError = console.error.bind(console)

  function cleanArgs(args) {
    if (typeof args[0] !== 'string') return args
    var str = args[0], argIdx = 1

    if (str.indexOf('%c') !== -1) {
      argIdx += (str.match(/%c/g) || []).length
      str = str.replace(/%c/g, '')
    }

    if (str.match(/%[dsfioO]/)) {
      str = str.replace(/%[dsfioO]/g, function () {
        return argIdx < args.length ? String(args[argIdx++]) : arguments[0]
      })
    }

    var remaining = []
    while (argIdx < args.length) remaining.push(args[argIdx++])
    return [str].concat(remaining)
  }

  function addEntry(level, args) {
    args = cleanArgs(args)
    var now = new Date()
    var time = now.toLocaleTimeString()
    var text = args.map(function (a) {
      if (typeof a === 'object') {
        if (a instanceof Error) return a.stack || a.message
        try { return JSON.stringify(a, null, 2) } catch (_) { return String(a) }
      }
      return String(a)
    }).join(' ')

    entries.push({ id: ++idCounter, time: time, level: level, text: text })
    if (entries.length > MAX) entries.splice(0, TRIM)

    if (open && overlay) render()
  }

  console.log = function () { origLog.apply(console, arguments); addEntry('LOG', Array.prototype.slice.call(arguments)) }
  console.warn = function () { origWarn.apply(console, arguments); addEntry('WARN', Array.prototype.slice.call(arguments)) }
  console.error = function () { origError.apply(console, arguments); addEntry('ERROR', Array.prototype.slice.call(arguments)) }

  window.onerror = function (msg, _url, _line, _col, err) {
    addEntry('ERROR', [err ? (err.stack || err.message) : msg])
  }

  window.onunhandledrejection = function (e) {
    addEntry('ERROR', [e.reason ? (e.reason.stack || e.reason.message) : String(e)])
  }

  addEntry('LOG', ['Debug console loaded — Ctrl+Shift+P to toggle'])

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function hlJSON(val, indent) {
    var ni = indent + '  '
    if (val === null) return '<span style="color:' + C.mauve + '">null</span>'
    if (typeof val === 'boolean') return '<span style="color:' + C.mauve + '">' + val + '</span>'
    if (typeof val === 'number') return '<span style="color:' + C.peach + '">' + val + '</span>'
    if (typeof val === 'string') return '<span style="color:' + C.green + '">"' + esc(val) + '"</span>'
    if (Array.isArray(val)) {
      if (val.length === 0) return '[]'
      var items = val.map(function (v) { return ni + hlJSON(v, ni) }).join(',\n')
      return '[\n' + items + '\n' + indent + ']'
    }
    if (typeof val === 'object') {
      var keys = Object.keys(val)
      if (keys.length === 0) return '{}'
      var props = keys.map(function (k) {
        return ni + '<span style="color:' + C.blue + '">"' + esc(k) + '"</span>: ' + hlJSON(val[k], ni)
      }).join(',\n')
      return '{\n' + props + '\n' + indent + '}'
    }
    return esc(String(val))
  }

  function hlText(s) {
    s = esc(s)
    s = s.replace(/(https?:\/\/[^\s<>"]+)/g, '<span style=\'color:' + C.blue + ';text-decoration:underline\'>$1</span>')
    s = s.replace(/\[([^\]]+)\]/g, '<span style=\'color:' + C.mauve + '\'>[$1]</span>')
    s = s.replace(/(?<=^|[^:\d.])(\d+)(?=[^:\d.]|$)/g, '<span style=\'color:' + C.peach + '\'>$1</span>')
    s = s.replace(/"([^"]*)"/g, '<span style=\'color:' + C.green + '\'>"$1"</span>')
    return s
  }

  function highlight(text) {
    var trimmed = text.trim()
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        var parsed = JSON.parse(trimmed)
        return hlJSON(parsed, '')
      } catch (_) {}
    }
    return hlText(text)
  }

  function levelColor(level) {
    return level === 'ERROR' ? C.red : level === 'WARN' ? C.yellow : C.text
  }

  function entryText(e) {
    return '[' + e.time + '] ' + e.level + ': ' + e.text
  }

  function render() {
    if (!overlay) return
    var body = overlay.querySelector('.dc-body')
    if (!body) return

    var html = ''
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i]
      var lc = levelColor(e.level)
      html += '<div class="dc-entry" data-id="' + e.id + '">' +
        '<span class="dc-time" style="color:' + C.overlay0 + '">[' + e.time + ']</span> ' +
        '<span class="dc-level" style="color:' + lc + ';font-weight:700">' + e.level + ':</span> ' +
        '<span class="dc-msg">' + highlight(e.text) + '</span>' +
        '</div>'
    }
    body.innerHTML = html
    if (autoScroll) body.scrollTop = body.scrollHeight
  }

  function copyToClip(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(function () {})
      return
    }
    var ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (_) {}
    document.body.removeChild(ta)
  }

  function btnStyle(color) {
    return 'background:none;border:1px solid ' + color + ';color:' + color +
      ';cursor:pointer;padding:2px 8px;border-radius:4px;font-family:inherit;font-size:11px'
  }

  function buildOverlay() {
    overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;' +
      'display:flex;flex-direction:column;background:' + C.base + ';color:' + C.text + ';' +
      'font-family:Menlo,Consolas,monospace;font-size:12px;max-height:40vh;' +
      'border-top:2px solid ' + C.red + ';user-select:text'

    var header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;' +
      'padding:6px 10px;background:' + C.mantle + ';border-bottom:1px solid ' + C.surface0 + ';flex-shrink:0'

    var title = document.createElement('span')
    title.style.cssText = 'color:' + C.red + ';font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.05em'
    title.textContent = '\u25B8 Console  (Ctrl+Shift+P to close)'

    var actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:6px'

    var copyAllBtn = document.createElement('button')
    copyAllBtn.textContent = 'Copy All'
    copyAllBtn.style.cssText = btnStyle(C.blue)
    copyAllBtn.onclick = function () {
      var text = ''
      for (var i = 0; i < entries.length; i++) {
        text += entryText(entries[i]) + '\n'
      }
      copyToClip(text.trim())
    }

    var clearBtn = document.createElement('button')
    clearBtn.textContent = 'Clear'
    clearBtn.style.cssText = btnStyle(C.peach)
    clearBtn.onclick = function () { entries = []; render() }

    var closeBtn = document.createElement('button')
    closeBtn.textContent = '\u2715'
    closeBtn.style.cssText = btnStyle(C.red)
    closeBtn.onclick = toggle

    actions.appendChild(copyAllBtn)
    actions.appendChild(clearBtn)
    actions.appendChild(closeBtn)
    header.appendChild(title)
    header.appendChild(actions)
    overlay.appendChild(header)

    var body = document.createElement('div')
    body.className = 'dc-body'
    body.style.cssText = 'flex:1;overflow-y:auto;padding:4px 10px 10px;' +
      'line-height:1.5;white-space:pre-wrap;overflow-wrap:break-word'
    body.onscroll = function () {
      autoScroll = body.scrollHeight - body.scrollTop - body.clientHeight < 40
    }
    body.addEventListener('click', function (e) {
      var entryEl = e.target.closest('.dc-entry')
      if (!entryEl) return
      var id = Number(entryEl.getAttribute('data-id'))
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].id === id) {
          copyToClip(entryText(entries[i]))
          break
        }
      }
    })

    overlay.appendChild(body)
    document.body.appendChild(overlay)
    render()
  }

  function toggle() {
    open = !open
    if (open) {
      if (!overlay) buildOverlay()
      overlay.style.display = 'flex'
      render()
    } else {
      if (overlay) overlay.style.display = 'none'
    }
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyP') {
      e.preventDefault()
      e.stopPropagation()
      toggle()
    }
  }, true)

  window.__debugConsole = { entries: entries, toggle: toggle }
})()
