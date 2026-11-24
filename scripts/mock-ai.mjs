// A scripted stand-in for the Anthropic and OpenAI APIs, for scripts/ai-test.mjs.
// Turn 1: look things up. Turn 2: create a report. Turn 3: answer. Logs each request body.
import http from 'node:http';
import { writeFileSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? 8790);
const LOG = process.env.LOG ?? '/tmp/mock-ai.json';
const log = [];

const step = (messages) => messages.filter((m) => m.role === 'assistant').length; // replies so far this chat

function plan(n) {
  if (n === 0) return { text: 'Let me look at your diary.', tools: [['get_overview', {}], ['get_entries', { types: ['pain', 'posture'], limit: 50 }]] };
  if (n === 1) return { text: '', tools: [['compare_pain', { factor: 'posture:couch', start_hours: 0, end_hours: 6 }], ['create_report', { summary: 'Pain averaged 5/10 over the period.\n\nIt was higher after long spells on the couch.', questions: ['Is the tingling in my thumb expected?'] }]] };
  return { text: 'Your report is ready.\n\n- Pain was **higher** after sitting on the couch\n- 2 readings support this, so it is an early hint\n\nAnything else?', tools: [] };
}

function sse(res, events) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' });
  for (const [type, data] of events) res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  res.end();
}

function anthropic(body, res) {
  const p = plan(step(body.messages));
  const content = [];
  const events = [['message_start', { message: { id: 'msg_' + Date.now(), type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }]];
  let i = 0;
  if (p.text) {
    events.push(['content_block_start', { index: i, content_block: { type: 'text', text: '' } }]);
    for (const piece of p.text.match(/.{1,12}/gs)) events.push(['content_block_delta', { index: i, delta: { type: 'text_delta', text: piece } }]);
    events.push(['content_block_stop', { index: i++ }]);
  }
  for (const [name, input] of p.tools) {
    const id = `toolu_${name}_${Date.now()}_${i}`;
    events.push(['content_block_start', { index: i, content_block: { type: 'tool_use', id, name, input: {} } }]);
    const json = JSON.stringify(input);
    for (const piece of json.match(/.{1,10}/gs)) events.push(['content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: piece } }]);
    events.push(['content_block_stop', { index: i++ }]);
  }
  events.push(['message_delta', { delta: { stop_reason: p.tools.length ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } }]);
  events.push(['message_stop', {}]);
  sse(res, events);
  void content;
}

function openai(body, res) {
  const p = plan(step(body.messages));
  const msg = { role: 'assistant', content: p.text || null, refusal: null };
  if (p.tools.length) msg.tool_calls = p.tools.map(([name, input], i) => ({ id: `call_${name}_${i}`, type: 'function', function: { name, arguments: JSON.stringify(input) } }));
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model: body.model, choices: [{ index: 0, message: msg, finish_reason: p.tools.length ? 'tool_calls' : 'stop' }] }));
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' });
    return res.end();
  }
  let raw = '';
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  log.push({ path: req.url, headers: { key: req.headers['x-api-key'] ?? req.headers.authorization, browser: req.headers['anthropic-dangerous-direct-browser-access'], beta: req.headers['anthropic-beta'] }, body });
  writeFileSync(LOG, JSON.stringify(log, null, 1));
  if (req.url.endsWith('/models')) {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-model-a', type: 'model', object: 'model' }, { id: 'mock-model-b', type: 'model', object: 'model' }], has_more: false, first_id: 'a', last_id: 'b' }));
  }
  if (req.url.endsWith('/v1/messages')) return anthropic(body, res);
  if (req.url.endsWith('/chat/completions')) return openai(body, res);
  res.writeHead(404, { 'access-control-allow-origin': '*' });
  res.end();
}).listen(PORT, '127.0.0.1', () => console.log('mock AI on', PORT));
