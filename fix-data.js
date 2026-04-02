const fs = require('fs')
const f = 'release/data/laundry-data.json'
const d = JSON.parse(fs.readFileSync(f))
const s = d.snapshot || d
let count = 0
s.records.forEach(function(r) {
  if (r.status === 'received' && (!r.subStatus || r.subStatus === 'received_uncat' || r.subStatus === 'received_ready')) {
    r.status = 'washed'
    r.subStatus = 'washed_waiting'
    count++
  }
})
if (d.snapshot) d.snapshot = s
fs.writeFileSync(f, JSON.stringify(d, null, 2))
console.log('updated:', count)
