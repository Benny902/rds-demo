document.addEventListener('DOMContentLoaded', () => {
  const endpointSelect = document.getElementById('endpoint')
  const correlationInput = document.getElementById('correlationId')
  const resourceIdInput = document.getElementById('resourceId')
  const submitBtn = document.getElementById('submitBtn')
  const runBtn = document.getElementById('runBenchmark')
  const benchmarkOutput = document.getElementById('benchmarkOutput')
  const output = document.getElementById('output')
  const virtualUsersInput = document.getElementById('virtualUsers')
  const durationInput = document.getElementById('duration')
  const exportJsonBtn = document.getElementById('exportJson')
  const localitySuggestions = document.getElementById('localitySuggestions')

  let latestResults = []
  let cachedLocalities = []
  let latestSummary = null

  const resolveLocalityId = input => {
    if (!input || !cachedLocalities.length) return input
    const match = cachedLocalities.find(l => l.localityId === input || l.localityName === input)
    return match?.localityId || input
  }

  const rebuildLocalitySuggestions = list => {
    localitySuggestions.innerHTML = ''
    list.slice().sort((a, b) => a.localityName.localeCompare(b.localityName)).forEach(({ localityName }) => {
      const option = document.createElement('option')
      option.value = localityName
      localitySuggestions.appendChild(option)
    })
  }

  const updateLocalityCache = json => {
    if (json?.data && Array.isArray(json.data)) {
      cachedLocalities = json.data
      rebuildLocalitySuggestions(cachedLocalities)
      console.log('Localities loaded:', cachedLocalities.length)
    }
  }

  const summarizeBenchmark = (results, durationSec) => {
    const durations = results.filter(r => r.success).map(r => r.duration).sort((a, b) => a - b)
    const percentile = p => durations[Math.floor(p / 100 * durations.length)]?.toFixed(2) || '0'
    const total = results.length
    const success = results.filter(r => r.success).length
    const failed = total - success
    const avg = (durations.reduce((a, b) => a + b, 0) / durations.length || 0).toFixed(2)
    const min = Math.min(...durations).toFixed(2)
    const max = Math.max(...durations).toFixed(2)
    const rps = (success / durationSec).toFixed(2)

    return { total, success, failed, min_ms: min, max_ms: max, avg_ms: avg, rps, p50: percentile(50), p90: percentile(90), p99: percentile(99) }
  }

  const runFrontendBenchmark = async (endpoint, correlationId, virtualUsers, durationSec) => {
    const results = []
    const endTime = Date.now() + durationSec * 1000

    const runRequest = async () => {
      const start = performance.now()
      try {
        const res = await fetch(endpoint, { method: 'GET', headers: { 'X-Correlation-ID': correlationId } })
        const end = performance.now()
        results.push({ status: res.status, duration: end - start, success: res.ok })
      } catch {
        results.push({ status: 0, duration: 0, success: false })
      }
    }

    while (Date.now() < endTime) {
      const batch = []
      for (let i = 0; i < virtualUsers; i++) batch.push(runRequest())
      await Promise.all(batch)
    }

    return results
  }

  const handleSubmit = async () => {
    let endpoint = endpointSelect.value
    const correlationId = correlationInput.value.trim()
    const input = resourceIdInput.value.trim()

    if (!correlationId) return alert('Enter correlation ID')
    if (endpoint.includes('{id}') && !input) return alert('Enter ID')

    const resolvedId = resolveLocalityId(input)
    endpoint = endpoint.replace('{id}', encodeURIComponent(resolvedId))
    const fullUrl = `/api${endpoint}`

    try {
      const res = await fetch(fullUrl, { method: 'GET', headers: { 'X-Correlation-ID': correlationId } })
      const text = await res.text()
      output.textContent = `Status: ${res.status}\n\n${text}`

      if (endpoint === '/v1/localities') {
        try {
          const parsed = JSON.parse(text)
          updateLocalityCache(parsed)
        } catch {}
      }
    } catch (err) {
      output.textContent = `ERROR: ${err.message}`
    }
  }

  const handleBenchmark = async () => {
    let endpoint = endpointSelect.value
    const correlationId = correlationInput.value.trim()
    const input = resourceIdInput.value.trim()

    if (!correlationId) return alert('Enter correlation ID')
    if (endpoint.includes('{id}') && !input) return alert('Enter ID')

    const resolvedId = resolveLocalityId(input)
    endpoint = endpoint.replace('{id}', encodeURIComponent(resolvedId))
    const fullUrl = `/api${endpoint}`

    const virtualUsers = parseInt(virtualUsersInput.value)
    const duration = parseInt(durationInput.value)

    benchmarkOutput.textContent = 'Running benchmark...'
    const results = await runFrontendBenchmark(fullUrl, correlationId, virtualUsers, duration)
    latestResults = results
    const summary = summarizeBenchmark(results, duration)
    summary.timestamp = new Date().toISOString()
    benchmarkOutput.textContent = JSON.stringify(summary, null, 2)
    latestSummary = summary
  }

  const exportJson = () => {
    const fullExport = {
      timestamp: latestSummary?.timestamp || new Date().toISOString(),
      summary: latestSummary || {},
      results: latestResults
    }
    const blob = new Blob([JSON.stringify(fullExport, null, 2)], { type: 'application/json' })
    
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    link.download = `benchmark-${timestamp}.json`    
    link.click()
  }

  const updateVisibility = () => {
    const needsId = endpointSelect.value.includes('{id}')
    resourceIdInput.classList.toggle('hidden', !needsId)
  }

  // Event bindings
  endpointSelect.addEventListener('change', updateVisibility)
  submitBtn.addEventListener('click', handleSubmit)
  runBtn.addEventListener('click', handleBenchmark)
  exportJsonBtn.addEventListener('click', exportJson)
  updateVisibility()

  // Preload cache on load
  fetch('/api/v1/localities', {
    headers: { 'X-Correlation-ID': 'init-load' }
  })
    .then(res => res.json())
    .then(updateLocalityCache)
    .catch(err => console.warn('Failed to preload localities:', err.message))
})
