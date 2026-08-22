import "../env";

import { getDataSource } from "../db/data-source";
import { sendNewFollowupCandidatesReport } from "../new-followup-report";

async function main() {
  const result = await sendNewFollowupCandidatesReport();
  const dataSource = await getDataSource();
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
