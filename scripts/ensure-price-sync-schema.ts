import 'dotenv/config'
import { ensurePriceSyncSchema } from '../src/pricing/ensurePriceSyncSchema'

async function main() {
  await ensurePriceSyncSchema()
  console.log('price_sync_jobs / price_sync_failures schema ready')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
