import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { fuelLogCsv, type FuelLog, type Vehicle } from '@roadtrip/core';

/** Write the fuel log to a CSV in the cache folder and open the share sheet. */
export async function exportFuelLogCsv(logs: readonly FuelLog[], vehicles: readonly Vehicle[]): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `fuel-log-${stamp}.csv`);
  if (file.exists) file.delete();
  await file.write(fuelLogCsv(logs, vehicles));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export fuel log', UTI: 'public.comma-separated-values-text' });
}
