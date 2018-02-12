const assert = require('assert')
const {
  createNoopTracer,
  ExplicitContext,
  Tracer,
  ConsoleRecorder
} = require('zipkin')
const {zipkinInterceptor} = require('../src')
const vueResource = require('vue-resource')
const Vue = require('vue')

describe('Zipkin interceptor', function() {
  const serviceName = 'foo'
  const remoteServiceName = 'bar'
  vueResource(Vue)

  it('should inject Zipkin headers into request', function() {
    var requestStore
    Vue.http.interceptors.push(function(request, next) {
      requestStore = request
      next(request.respondWith('', { status: 204, statusText: 'No Content' }))
    })
    const tracer = createNoopTracer()
    const interceptor = zipkinInterceptor({tracer, serviceName, remoteServiceName})

    Vue.http.interceptors.push(interceptor)

    const req = Vue.http.get('http://foo.bar/baz')

    return req.then(function(response) {
      assert.ok(requestStore.headers.get('X-B3-TraceId').length > 1)
      assert.ok(requestStore.headers.get('X-B3-SpanId').length > 1)
      assert.equal(requestStore.headers.get('X-B3-Sampled'), '1')
    })
  })


  it(`should use name ${serviceName} and remote name ${remoteServiceName}`, function() {
    var serviceNameLine = ''
    var serverAddrLine = ''
    const tracer = new Tracer({
      ctxImpl: new ExplicitContext(),
      recorder: new ConsoleRecorder(function(line) {
        if (line.indexOf('ServiceName("foo")') > -1) {
          serviceNameLine = line
        } else if (line.indexOf('ServerAddr(serviceName="bar"') > -1) {
          serverAddrLine = line
        }
      }),
      localServiceName: serviceName
    })

    Vue.http.interceptors.push(function(request, next) {
      next(request.respondWith('', { status: 204, statusText: 'No Content' }))
    })

    const interceptor = zipkinInterceptor({tracer, serviceName, remoteServiceName})
    Vue.http.interceptors.push(interceptor)

    const req = Vue.http.get('http://foo.bar/baz')
    return req.then(function(response) {
      assert.ok(serviceNameLine.length > 0)
      assert.ok(serverAddrLine.length > 0)
    })
  })

  
  it(`should record same traceID for all spans in request and response`, function() {
    const ids = new Set()
    const tracer = new Tracer({
      ctxImpl: new ExplicitContext(),
      recorder: new ConsoleRecorder(function(line) {
        var matches = /traceId=([a-f0-9]+)/g.exec(line)
        ids.add(matches[1])
      }),
      localServiceName: serviceName
    })

    Vue.http.interceptors.push(function(request, next) {
      next(request.respondWith('', { status: 204, statusText: 'No Content' }))
    })

    const interceptor = zipkinInterceptor({tracer, serviceName, remoteServiceName})
    Vue.http.interceptors.push(interceptor)

    const req = Vue.http.get('http://foo.bar/baz')
    return req.then(function(response) {
      assert.equal(ids.size, 1)
    })
  })
})