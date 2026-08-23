import "../env";

import { getDataSource } from "../db/data-source";
import { sendContactedFollowupCandidatesReport } from "../new-followup-report";

async function main() {
  await sendContactedFollowupCandidatesReport();
  const dataSource = await getDataSource();
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
