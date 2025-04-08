const containers = [
  { id: 'monolith', label: 'Monolith', baseUrl: '/monolith' },
  { id: 'microservice', label: 'Microservices', baseUrl: '/microservice' }
]

const containerRefs = {}
const summaries = {}

function updateComparisonHighlights() {
  const [a, b] = Object.keys(summaries)
  if (!a || !b) return

  const rpsA = parseFloat(summaries[a].rps)
  const rpsB = parseFloat(summaries[b].rps)

  const win = rpsA > rpsB ? a : b
  const lose = rpsA > rpsB ? b : a

  containerRefs[win].classList.add('winner')
  containerRefs[win].classList.remove('loser')

  containerRefs[lose].classList.add('loser')
  containerRefs[lose].classList.remove('winner')
}


containers.forEach(({ id, label, baseUrl }) => {
  const container = document.getElementById(id)
  containerRefs[id] = container

  container.innerHTML = `
    <h2>${label}</h2>

    <select class="endpoint">
      <option value="/v1/localities">GET /v1/localities</option>
      <option value="/v1/localities/{id}">GET /v1/localities/{id}</option>
      <option value="/v1/localities/{id}/streets">GET /v1/localities/{id}/streets</option>
    </select>

    <input type="text" class="correlationId" placeholder="X-Correlation-ID" />
    <input type="text" class="resourceId hidden" placeholder="Enter ID or Name" list="${id}-suggestions" />
    <datalist id="${id}-suggestions"></datalist>

    <button class="submitBtn">Submit Single Request</button>
    <pre class="output"></pre>

    <hr />

    <h3>Benchmark</h3>
    <div class="inline-input">
      <label>Virtual Users:</label>
      <input type="number" class="virtualUsers" value="10" />
    </div>
    <div class="inline-input">
      <label>Duration (sec):</label>
      <input type="number" class="duration" value="10" />
    </div>

      <button class="runBenchmark">Run Benchmark</button>
      <pre class="benchmarkOutput"></pre>
      <button class="exportJson">Export JSON</button>

  `

  const $ = selector => container.querySelector(selector)

  const endpointSelect = $('.endpoint')
  const correlationInput = $('.correlationId')
  const resourceIdInput = $('.resourceId')
  const submitBtn = $('.submitBtn')
  const runBtn = $('.runBenchmark')
  const exportJsonBtn = $('.exportJson')
  const benchmarkOutput = $('.benchmarkOutput')
  const output = $('.output')
  const virtualUsersInput = $('.virtualUsers')
  const durationInput = $('.duration')
  const suggestionsList = $(`#${id}-suggestions`)

  let cachedLocalities = []
  let latestResults = []
  let latestSummary = null

  const resolveLocalityId = input => {
    const match = cachedLocalities.find(l => l.localityId === input || l.localityName === input)
    return match?.localityId || input
  }

  const rebuildSuggestions = list => {
    suggestionsList.innerHTML = ''
    list.slice().sort((a, b) => a.localityName.localeCompare(b.localityName)).forEach(({ localityName }) => {
      const option = document.createElement('option')
      option.value = localityName
      suggestionsList.appendChild(option)
    })
  }

  const updateVisibility = () => {
    resourceIdInput.classList.toggle('hidden', !endpointSelect.value.includes('{id}'))
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

  const runBenchmark = async (endpoint, correlationId, virtualUsers, durationSec) => {
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

  submitBtn.addEventListener('click', async () => {
    let endpoint = endpointSelect.value
    const correlationId = correlationInput.value.trim()
    const input = resourceIdInput.value.trim()

    if (!correlationId) return alert('Enter correlation ID')
    if (endpoint.includes('{id}') && !input) return alert('Enter ID')

    const resolvedId = resolveLocalityId(input)
    endpoint = endpoint.replace('{id}', encodeURIComponent(resolvedId))
    const fullUrl = `${baseUrl}${endpoint}`

    try {
      const res = await fetch(fullUrl, { method: 'GET', headers: { 'X-Correlation-ID': correlationId } })
      const text = await res.text()
      output.textContent = `Status: ${res.status}\n\n${text}`

      if (endpoint === '/v1/localities') {
        try {
          const parsed = JSON.parse(text)
          cachedLocalities = parsed.data
          rebuildSuggestions(cachedLocalities)
        } catch {}
      }
    } catch (err) {
      output.textContent = `ERROR: ${err.message}`
    }
  })

  runBtn.addEventListener('click', async () => {
    let endpoint = endpointSelect.value
    const correlationId = correlationInput.value.trim()
    const input = resourceIdInput.value.trim()

    if (!correlationId) return alert('Enter correlation ID')
    if (endpoint.includes('{id}') && !input) return alert('Enter ID')

    const resolvedId = resolveLocalityId(input)
    endpoint = endpoint.replace('{id}', encodeURIComponent(resolvedId))
    const fullUrl = `${baseUrl}${endpoint}`

    const virtualUsers = parseInt(virtualUsersInput.value)
    const duration = parseInt(durationInput.value)

    benchmarkOutput.textContent = 'Running benchmark...'
    const results = await runBenchmark(fullUrl, correlationId, virtualUsers, duration)
    latestResults = results
    const summary = summarizeBenchmark(results, duration)
    summary.timestamp = new Date().toISOString()
    latestSummary = summary
    benchmarkOutput.textContent = JSON.stringify(summary, null, 2)
    summaries[id] = summary
    updateComparisonHighlights()    
  })

  exportJsonBtn.addEventListener('click', () => {
    const fullExport = {
      timestamp: latestSummary?.timestamp || new Date().toISOString(),
      summary: latestSummary || {},
      results: latestResults
    }
    const blob = new Blob([JSON.stringify(fullExport, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    link.download = `${label.toLowerCase()}-benchmark-${timestamp}.json`
    link.click()
  })

  endpointSelect.addEventListener('change', updateVisibility)
  updateVisibility()

  // Preload on load
  fetch(`${baseUrl}/v1/localities`, {
    headers: { 'X-Correlation-ID': 'init-load' }
  })
    .then(res => res.json())
    .then(json => {
      if (json?.data && Array.isArray(json.data)) {
        cachedLocalities = json.data
        rebuildSuggestions(cachedLocalities)
      }
    })
    .catch(err => console.warn(`${label} preload error:`, err.message))
})
