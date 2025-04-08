import {
  resolveLocalityId,
  rebuildSuggestions,
  updateVisibility,
  buildDropdown
} from './scripts.helpers.js'

import {
  runBenchmark,
  summarizeBenchmark
} from './scripts.benchmark.js'

import {
  updateComparisonHighlights,
  renderLatencyChart
} from './scripts.chart.js'

const containers = [
  { id: 'monolith', label: 'Monolith', baseUrl: '/monolith' },
  { id: 'microservice', label: 'Microservices', baseUrl: '/microservice' }
]

const containerRefs = {}
const summaries = {}

const templateHtml = await fetch('container.template.html').then(r => r.text())

containers.forEach(async ({ id, label, baseUrl }) => {
  const container = document.getElementById(id)
  containerRefs[id] = container

  container.innerHTML = templateHtml
    .replaceAll('{label}', label)
    .replaceAll('{datalist-id}', `${id}-suggestions`)
  

  // Element references
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
  const dropdown = $('.resultDropdown')
  const suggestionsList = $(`#${id}-suggestions`)

  // State
  let cachedLocalities = []
  let latestResults = []
  let latestSummary = null

  // Handlers
  submitBtn.addEventListener('click', async () => {
    let endpoint = endpointSelect.value
    const correlationId = correlationInput.value.trim()
    const input = resourceIdInput.value.trim()
    if (!correlationId) return alert('Enter correlation ID')
    if (endpoint.includes('{id}') && !input) return alert('Enter ID')

    const resolvedId = resolveLocalityId(input, cachedLocalities)
    endpoint = endpoint.replace('{id}', encodeURIComponent(resolvedId))
    const fullUrl = `${baseUrl}${endpoint}`

    try {
      const res = await fetch(fullUrl, { headers: { 'X-Correlation-ID': correlationId } })
      const text = await res.text()
      output.textContent = `Status: ${res.status}\n\n${text}`

      try {
        const json = JSON.parse(text)
        buildDropdown(endpoint, json, dropdown)

        if (endpoint === '/v1/localities') {
          cachedLocalities = json.data
          rebuildSuggestions(cachedLocalities, suggestionsList)
        }
      } catch {}
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

    const resolvedId = resolveLocalityId(input, cachedLocalities)
    endpoint = endpoint.replace('{id}', encodeURIComponent(resolvedId))
    const fullUrl = `${baseUrl}${endpoint}`

    const virtualUsers = parseInt(virtualUsersInput.value)
    const duration = parseInt(durationInput.value)

    benchmarkOutput.textContent = 'Running benchmark...'
    const results = await runBenchmark(fullUrl, correlationId, virtualUsers, duration)
    latestResults = results
    latestSummary = summarizeBenchmark(results, duration)
    latestSummary.timestamp = new Date().toISOString()
    benchmarkOutput.textContent = JSON.stringify(latestSummary, null, 2)

    summaries[id] = latestSummary
    updateComparisonHighlights(summaries, containerRefs)
    renderLatencyChart(summaries)
  })

  exportJsonBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ summary: latestSummary, results: latestResults }, null, 2)], {
      type: 'application/json'
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${label.toLowerCase()}-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    a.click()
  })

  endpointSelect.addEventListener('change', () => updateVisibility(endpointSelect, resourceIdInput))
  updateVisibility(endpointSelect, resourceIdInput)

  // Preload suggestions
  fetch(`${baseUrl}/v1/localities`, {
    headers: { 'X-Correlation-ID': 'init-load' }
  })
    .then(res => res.json())
    .then(json => {
      if (Array.isArray(json?.data)) {
        cachedLocalities = json.data
        rebuildSuggestions(cachedLocalities, suggestionsList)
      }
    })
    .catch(err => console.warn(`${label} preload error:`, err.message))
})
