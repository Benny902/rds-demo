document.addEventListener('DOMContentLoaded', () => {
  const endpointSelect = document.getElementById('endpoint')
  const correlationInput = document.getElementById('correlationId')
  const resourceIdInput = document.getElementById('resourceId')
  const idLabel = document.getElementById('idLabel')
  const submitBtn = document.getElementById('submitBtn')
  const runBtn = document.getElementById('runBenchmark')
  const benchmarkOutput = document.getElementById('benchmarkOutput')
  const output = document.getElementById('output')
  const virtualUsersInput = document.getElementById('virtualUsers')
  const durationInput = document.getElementById('duration')
  const exportJsonBtn = document.getElementById('exportJson')
  const exportCsvBtn = document.getElementById('exportCsv')

  let latestResults = []

  function updateVisibility() {
    const needsId = endpointSelect.value.includes('{id}')
    resourceIdInput.classList.toggle('hidden', !needsId)
  }
  

  endpointSelect.addEventListener('change', updateVisibility)
  updateVisibility()

  function summarizeBenchmark(results, durationSec) {
    const durations = results.filter(r => r.success).map(r => r.duration).sort((a, b) => a - b)
    const percentile = p => durations[Math.floor(p / 100 * durations.length)]?.toFixed(2) || '0'
    const total = results.length
    const success = results.filter(r => r.success).length
    const failed = total - success
    const avg = (durations.reduce((a, b) => a + b, 0) / durations.length || 0).toFixed(2)
    const min = Math.min(...durations).toFixed(2)
    const max = Math.max(...durations).toFixed(2)
    const rps = (success / durationSec).toFixed(2)

    return {
      total,
      success,
      failed,
      min_ms: min,
      max_ms: max,
      avg_ms: avg,
      rps,
      p50: percentile(50),
      p90: percentile(90),
      p99: percentile(99)
    }
  }

  async function runFrontendBenchmark(endpoint, correlationId, virtualUsers, durationSec) {
    const results = []
    const endTime = Date.now() + durationSec * 1000

    const runRequest = async () => {
      const start = performance.now()
      try {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: { 'X-Correlation-ID': correlationId }
        })
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

  submitBtn.addEventListener('click', async () => {
    let endpoint = endpointSelect.value
    const correlationId = correlationInput.value.trim()
    const resourceId = resourceIdInput.value.trim()

    if (!correlationId) return alert('Enter correlation ID')
    if (endpoint.includes('{id}') && !resourceId) return alert('Enter ID')

    endpoint = endpoint.replace('{id}', encodeURIComponent(resourceId))
    const fullUrl = `/api${endpoint}`

    try {
      const res = await fetch(fullUrl, {
        method: 'GET',
        headers: { 'X-Correlation-ID': correlationId }
      })
      const text = await res.text()
      output.textContent = `Status: ${res.status}\n\n${text}`
    } catch (err) {
      output.textContent = `ERROR: ${err.message}`
    }
  })

  runBtn.addEventListener('click', async () => {
    let endpoint = endpointSelect.value
    const correlationId = correlationInput.value.trim()
    const resourceId = resourceIdInput.value.trim()

    if (!correlationId) return alert('Enter correlation ID')
    if (endpoint.includes('{id}') && !resourceId) return alert('Enter ID')

    endpoint = endpoint.replace('{id}', encodeURIComponent(resourceId))
    const fullUrl = `/api${endpoint}`

    const virtualUsers = parseInt(virtualUsersInput.value)
    const duration = parseInt(durationInput.value)

    benchmarkOutput.textContent = 'Running benchmark...'
    const results = await runFrontendBenchmark(fullUrl, correlationId, virtualUsers, duration)
    const summary = summarizeBenchmark(results, duration)

    latestResults = results
    benchmarkOutput.textContent = JSON.stringify(summary, null, 2)
  })

  exportJsonBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(latestResults, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'benchmark.json'
    link.click()
  })

  exportCsvBtn.addEventListener('click', () => {
    const csv = latestResults.map(r =>
      `${r.status},${r.duration.toFixed(2)},${r.success}`
    ).join('\n')
    const header = 'status,duration_ms,success\n'
    const blob = new Blob([header + csv], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'benchmark.csv'
    link.click()
  })
})
