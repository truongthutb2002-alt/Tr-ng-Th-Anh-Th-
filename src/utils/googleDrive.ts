import type { DriveSyncMetadata, WorkspaceSnapshot } from '../types/planner.ts';
import { buildDriveBackupEnvelope, parseDriveBackupPayload } from './snapshotSync.ts';

export const PLANTEA_DRIVE_FOLDER_NAME = 'Plantea';
export const PLANTEA_DRIVE_FILE_NAME = 'plantea-data.json';

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

interface DriveFileListResponse {
  files?: Array<{
    id: string;
    name: string;
    mimeType?: string;
    modifiedTime?: string;
  }>;
}

export function buildFolderSearchQuery(folderName = PLANTEA_DRIVE_FOLDER_NAME): string {
  const escaped = folderName.replace(/'/g, "\\'");
  return `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
}

export function buildChildFolderListQuery(parentFolderId: string): string {
  const escapedParent = parentFolderId.replace(/'/g, "\\'");
  return `'${escapedParent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
}

export function buildFileSearchQuery(
  folderId: string,
  fileName = PLANTEA_DRIVE_FILE_NAME,
): string {
  const escapedFolder = folderId.replace(/'/g, "\\'");
  const escapedFile = fileName.replace(/'/g, "\\'");
  return `'${escapedFolder}' in parents and name='${escapedFile}' and trashed=false`;
}

export function formatDriveMonthFolderName(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!match) return monthKey.trim() || 'Tháng';
  return `Tháng ${match[2]} - ${match[1]}`;
}

export function formatDriveMonthFileName(monthKey: string): string {
  const safe = monthKey.trim().replace(/[^0-9-]/g, '');
  return `plantea-${safe || 'month'}.json`;
}

export function collectWorkspaceMonthKeys(
  snapshot?: WorkspaceSnapshot | null,
  referenceDate: Date = new Date(),
): string[] {
  const monthSet = new Set<string>();
  const refYear = referenceDate.getFullYear();

  // Luôn tạo đủ 12 thư mục con theo từng tháng trong năm hiện tại bên trong thư mục Plantea
  for (let m = 1; m <= 12; m += 1) {
    monthSet.add(`${refYear}-${String(m).padStart(2, '0')}`);
  }

  if (snapshot) {
    for (const t of snapshot.tasks || []) {
      if (typeof t.date === 'string' && /^\d{4}-\d{2}/.test(t.date)) {
        monthSet.add(t.date.slice(0, 7));
      }
    }
    for (const inc of snapshot.incomes || []) {
      if (typeof inc.month === 'string' && /^\d{4}-\d{2}$/.test(inc.month)) {
        monthSet.add(inc.month);
      }
    }
    for (const todo of snapshot.todos || []) {
      if (typeof todo.date === 'string' && /^\d{4}-\d{2}/.test(todo.date)) {
        monthSet.add(todo.date.slice(0, 7));
      }
    }
    for (const note of snapshot.dailyNotes || []) {
      if (typeof note.date === 'string' && /^\d{4}-\d{2}/.test(note.date)) {
        monthSet.add(note.date.slice(0, 7));
      }
    }
    for (const key of Object.keys(snapshot.monthlyIncomeTargets || {})) {
      if (/^\d{4}-\d{2}$/.test(key)) {
        monthSet.add(key);
      }
    }
    for (const st of snapshot.students || []) {
      for (const sess of st.sessions || []) {
        if (typeof sess.date === 'string' && /^\d{4}-\d{2}/.test(sess.date)) {
          monthSet.add(sess.date.slice(0, 7));
        }
      }
    }
  }

  return Array.from(monthSet).sort();
}

export function collectActiveDataMonthKeys(
  snapshot: WorkspaceSnapshot,
  referenceDate: Date = new Date(),
): string[] {
  const active = new Set<string>();
  const currentMonthKey = `${referenceDate.getFullYear()}-${String(
    referenceDate.getMonth() + 1,
  ).padStart(2, '0')}`;
  active.add(currentMonthKey);

  for (const t of snapshot.tasks || []) {
    if (typeof t.date === 'string' && /^\d{4}-\d{2}/.test(t.date)) {
      active.add(t.date.slice(0, 7));
    }
  }
  for (const inc of snapshot.incomes || []) {
    if (typeof inc.month === 'string' && /^\d{4}-\d{2}$/.test(inc.month)) {
      active.add(inc.month);
    }
  }
  for (const todo of snapshot.todos || []) {
    if (typeof todo.date === 'string' && /^\d{4}-\d{2}/.test(todo.date)) {
      active.add(todo.date.slice(0, 7));
    }
  }
  for (const note of snapshot.dailyNotes || []) {
    if (typeof note.date === 'string' && /^\d{4}-\d{2}/.test(note.date)) {
      active.add(note.date.slice(0, 7));
    }
  }
  for (const key of Object.keys(snapshot.monthlyIncomeTargets || {})) {
    if (/^\d{4}-\d{2}$/.test(key)) {
      active.add(key);
    }
  }
  for (const st of snapshot.students || []) {
    for (const sess of st.sessions || []) {
      if (typeof sess.date === 'string' && /^\d{4}-\d{2}/.test(sess.date)) {
        active.add(sess.date.slice(0, 7));
      }
    }
  }

  return Array.from(active).sort();
}

export function sliceSnapshotForMonth(
  snapshot: WorkspaceSnapshot,
  monthKey: string,
): WorkspaceSnapshot {
  const prefix = `${monthKey}-`;
  const monthTasks = (snapshot.tasks || []).filter((t) => t.date.startsWith(prefix));
  const monthIncomes = (snapshot.incomes || []).filter((i) => i.month === monthKey);
  const monthTodos = (snapshot.todos || []).filter((t) => t.date.startsWith(prefix));
  const monthNotes = (snapshot.dailyNotes || []).filter((n) => n.date.startsWith(prefix));
  const monthNum = Number(monthKey.slice(5, 7));
  const monthStudents = (snapshot.students || [])
    .map((st) => {
      const sessions = (st.sessions || []).filter((s) => s.date.startsWith(prefix));
      if (sessions.length === 0 && st.month !== monthNum) return null;
      return { ...st, sessions };
    })
    .filter((st): st is NonNullable<typeof st> => st !== null);

  const monthlyTarget = snapshot.monthlyIncomeTargets?.[monthKey];
  const dailyIncomeTargets: Record<string, number> = {};
  for (const [k, v] of Object.entries(snapshot.dailyIncomeTargets || {})) {
    if (k.startsWith(prefix)) dailyIncomeTargets[k] = v;
  }

  return {
    workspaceId: snapshot.workspaceId,
    revision: snapshot.revision,
    lastSavedAt: snapshot.lastSavedAt,
    lastEditedBy: snapshot.lastEditedBy,
    tasks: monthTasks,
    incomes: monthIncomes,
    students: monthStudents,
    todos: monthTodos,
    dailyNotes: monthNotes,
    monthlyIncomeTargets: monthlyTarget !== undefined ? { [monthKey]: monthlyTarget } : {},
    dailyIncomeTargets,
    appearance: snapshot.appearance,
  };
}

export function buildDriveMultipartRequest(params: {
  metadata: Record<string, unknown>;
  contentJson: string;
  boundary?: string;
}): { contentType: string; body: string } {
  const boundary = params.boundary || 'plantea_drive_boundary_2026';
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(params.metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${params.contentJson}\r\n` +
    `--${boundary}--`;
  return {
    contentType: `multipart/related; boundary=${boundary}`,
    body,
  };
}

async function parseDriveError(res: Response, fallbackMessage: string): Promise<Error> {
  if (res.status === 401 || res.status === 403) {
    return new Error('Quyền truy cập Google Drive đã hết hạn hoặc chưa được cấp phép. Vui lòng cấp phép lại.');
  }
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    if (data?.error?.message) {
      return new Error(`${fallbackMessage}: ${data.error.message}`);
    }
  } catch {
    // ignore JSON error parsing failure
  }
  return new Error(fallbackMessage);
}

export async function findPlanteaFolder(
  accessToken: string,
): Promise<{ id: string; name: string } | null> {
  const url = `${DRIVE_FILES_API}?q=${encodeURIComponent(
    buildFolderSearchQuery(PLANTEA_DRIVE_FOLDER_NAME),
  )}&fields=files(id,name,modifiedTime)&spaces=drive&orderBy=modifiedTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseDriveError(res, 'Không thể kiểm tra thư mục Plantea trên Google Drive');
  }
  const data = (await res.json()) as DriveFileListResponse;
  const folder = data.files?.[0];
  return folder ? { id: folder.id, name: folder.name } : null;
}

export async function ensurePlanteaFolder(
  accessToken: string,
): Promise<{ id: string; name: string; created: boolean }> {
  const existing = await findPlanteaFolder(accessToken);
  if (existing) {
    return { ...existing, created: false };
  }

  const res = await fetch(`${DRIVE_FILES_API}?fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: PLANTEA_DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!res.ok) {
    throw await parseDriveError(res, 'Không thể tạo thư mục Plantea trên Google Drive');
  }
  const created = (await res.json()) as { id: string; name: string };
  return { id: created.id, name: created.name || PLANTEA_DRIVE_FOLDER_NAME, created: true };
}

export async function ensurePlanteaMonthFolders(
  accessToken: string,
  parentFolderId: string,
  monthKeys: string[],
): Promise<Record<string, string>> {
  const listUrl = `${DRIVE_FILES_API}?q=${encodeURIComponent(
    buildChildFolderListQuery(parentFolderId),
  )}&fields=files(id,name)&spaces=drive&pageSize=200`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    throw await parseDriveError(listRes, 'Không thể kiểm tra các thư mục tháng trong Plantea');
  }
  const listData = (await listRes.json()) as DriveFileListResponse;
  const existingByName = new Map<string, string>();
  for (const f of listData.files || []) {
    if (f.name && f.id) {
      existingByName.set(f.name, f.id);
    }
  }

  const result: Record<string, string> = {};
  const missing: Array<{ monthKey: string; folderName: string }> = [];
  for (const monthKey of monthKeys) {
    const folderName = formatDriveMonthFolderName(monthKey);
    const existingId = existingByName.get(folderName);
    if (existingId) {
      result[monthKey] = existingId;
    } else {
      missing.push({ monthKey, folderName });
    }
  }

  // Tạo các thư mục tháng còn thiếu theo từng đợt 4 thư mục song song
  for (let i = 0; i < missing.length; i += 4) {
    const batch = missing.slice(i, i + 4);
    const createdBatch = await Promise.all(
      batch.map(async (item) => {
        const res = await fetch(`${DRIVE_FILES_API}?fields=id,name`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: item.folderName,
            parents: [parentFolderId],
            mimeType: 'application/vnd.google-apps.folder',
          }),
        });
        if (!res.ok) {
          throw await parseDriveError(
            res,
            `Không thể tạo thư mục "${item.folderName}" trong Plantea`,
          );
        }
        const created = (await res.json()) as { id: string };
        return { monthKey: item.monthKey, id: created.id };
      }),
    );
    for (const item of createdBatch) {
      result[item.monthKey] = item.id;
    }
  }

  return result;
}

export async function findPlanteaDataFile(
  accessToken: string,
  folderId: string,
  fileName = PLANTEA_DRIVE_FILE_NAME,
): Promise<{ id: string; name: string; modifiedTime?: string } | null> {
  const url = `${DRIVE_FILES_API}?q=${encodeURIComponent(
    buildFileSearchQuery(folderId, fileName),
  )}&fields=files(id,name,modifiedTime)&spaces=drive&orderBy=modifiedTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseDriveError(res, 'Không thể tìm tệp dữ liệu trong thư mục Plantea');
  }
  const data = (await res.json()) as DriveFileListResponse;
  return data.files?.[0] ?? null;
}

async function upsertJsonFileInDriveFolder(params: {
  accessToken: string;
  folderId: string;
  fileName: string;
  contentJson: string;
  existingFileId?: string;
}): Promise<{ id: string; modifiedTime?: string }> {
  const { accessToken, folderId, fileName, contentJson } = params;
  let targetFileId = params.existingFileId || '';
  if (!targetFileId) {
    const existing = await findPlanteaDataFile(accessToken, folderId, fileName);
    targetFileId = existing?.id || '';
  }

  if (targetFileId) {
    const { contentType, body } = buildDriveMultipartRequest({
      metadata: {
        name: fileName,
        mimeType: 'application/json',
      },
      contentJson,
    });
    const res = await fetch(
      `${DRIVE_UPLOAD_API}/${encodeURIComponent(targetFileId)}?uploadType=multipart&fields=id,name,modifiedTime`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': contentType,
        },
        body,
      },
    );
    if (!res.ok) {
      throw await parseDriveError(res, `Không thể cập nhật tệp "${fileName}" trên Google Drive`);
    }
    const updated = (await res.json()) as { id: string; modifiedTime?: string };
    return { id: updated.id || targetFileId, modifiedTime: updated.modifiedTime };
  }

  const { contentType, body } = buildDriveMultipartRequest({
    metadata: {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/json',
    },
    contentJson,
  });
  const res = await fetch(
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,modifiedTime`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
      },
      body,
    },
  );
  if (!res.ok) {
    throw await parseDriveError(res, `Không thể tạo tệp "${fileName}" trên Google Drive`);
  }
  const created = (await res.json()) as { id: string; modifiedTime?: string };
  return { id: created.id, modifiedTime: created.modifiedTime };
}

export async function inspectPlanteaDriveState(
  accessToken: string,
  targetWorkspaceId: string,
): Promise<{
  folderId: string;
  folderCreated: boolean;
  monthFolderCount: number;
  fileId: string;
  remoteSnapshot: WorkspaceSnapshot | null;
  remoteModifiedTime?: string;
}> {
  const folder = await ensurePlanteaFolder(accessToken);
  const allMonthKeys = collectWorkspaceMonthKeys(null);
  const monthFolders = await ensurePlanteaMonthFolders(accessToken, folder.id, allMonthKeys);
  const monthFolderCount = Object.keys(monthFolders).length;

  const file = await findPlanteaDataFile(accessToken, folder.id);
  if (!file) {
    return {
      folderId: folder.id,
      folderCreated: folder.created,
      monthFolderCount,
      fileId: '',
      remoteSnapshot: null,
    };
  }

  const mediaRes = await fetch(`${DRIVE_FILES_API}/${encodeURIComponent(file.id)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!mediaRes.ok) {
    throw await parseDriveError(mediaRes, 'Không thể đọc dữ liệu từ tệp Plantea trên Google Drive');
  }

  const rawJson = (await mediaRes.json()) as unknown;
  const parsedSnapshot = parseDriveBackupPayload(rawJson, targetWorkspaceId);
  return {
    folderId: folder.id,
    folderCreated: folder.created,
    monthFolderCount,
    fileId: file.id,
    remoteSnapshot: parsedSnapshot,
    remoteModifiedTime: file.modifiedTime,
  };
}

async function deleteDriveFileById(accessToken: string, fileId: string): Promise<void> {
  if (!fileId) return;
  const res = await fetch(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) {
    return;
  }
  if (!res.ok) {
    throw await parseDriveError(res, 'Không thể xóa tệp hoặc thư mục tháng trên Google Drive');
  }
}

export async function deletePlanteaMonthFromDrive(params: {
  accessToken: string;
  monthKey: string;
  updatedSnapshot: WorkspaceSnapshot;
  linkedEmail: string;
  existingFolderId?: string;
  existingFileId?: string;
}): Promise<DriveSyncMetadata> {
  const { accessToken, monthKey, updatedSnapshot, linkedEmail } = params;
  const folderId = params.existingFolderId || (await findPlanteaFolder(accessToken))?.id || '';

  if (!folderId) {
    // Nếu chưa từng có thư mục Plantea trên Drive, vẫn đảm bảo tạo và ghi bản snapshot sạch
    return writePlanteaDataToDrive({
      accessToken,
      snapshot: updatedSnapshot,
      linkedEmail,
      excludedMonthKeys: [monthKey],
    });
  }

  // Tìm và xóa thư mục con của tháng cần xóa (kèm tệp dữ liệu tháng bên trong)
  const listUrl = `${DRIVE_FILES_API}?q=${encodeURIComponent(
    buildChildFolderListQuery(folderId),
  )}&fields=files(id,name)&spaces=drive&pageSize=200`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    throw await parseDriveError(listRes, 'Không thể kiểm tra thư mục tháng trên Google Drive');
  }
  const listData = (await listRes.json()) as DriveFileListResponse;
  const targetFolderName = formatDriveMonthFolderName(monthKey);
  const matchingFolders = (listData.files || []).filter(
    (f) => f.id && f.name === targetFolderName,
  );

  for (const monthFolder of matchingFolders) {
    const monthFile = await findPlanteaDataFile(
      accessToken,
      monthFolder.id,
      formatDriveMonthFileName(monthKey),
    );
    if (monthFile?.id) {
      await deleteDriveFileById(accessToken, monthFile.id);
    }
    await deleteDriveFileById(accessToken, monthFolder.id);
  }

  // Cập nhật tệp tổng hợp plantea-data.json với dữ liệu sau khi đã xóa tháng
  const nowIso = new Date().toISOString();
  const masterEnvelope = buildDriveBackupEnvelope(updatedSnapshot, nowIso);
  const masterResult = await upsertJsonFileInDriveFolder({
    accessToken,
    folderId,
    fileName: PLANTEA_DRIVE_FILE_NAME,
    contentJson: JSON.stringify(masterEnvelope, null, 2),
    existingFileId: params.existingFileId,
  });

  const remainingFolderCount = Math.max(
    0,
    (listData.files || []).filter((f) => f.name !== targetFolderName).length,
  );

  return {
    linkedEmail,
    folderId,
    folderName: PLANTEA_DRIVE_FOLDER_NAME,
    fileId: masterResult.id,
    lastSyncedAt: masterResult.modifiedTime || nowIso,
    monthFolderCount: remainingFolderCount,
  };
}

export async function writePlanteaDataToDrive(params: {
  accessToken: string;
  snapshot: WorkspaceSnapshot;
  linkedEmail: string;
  existingFolderId?: string;
  existingFileId?: string;
  excludedMonthKeys?: string[];
}): Promise<DriveSyncMetadata> {
  const { accessToken, snapshot, linkedEmail } = params;
  const excludedSet = new Set(params.excludedMonthKeys || []);
  const folderId = params.existingFolderId || (await ensurePlanteaFolder(accessToken)).id;

  const allMonthKeys = collectWorkspaceMonthKeys(snapshot).filter((mk) => !excludedSet.has(mk));
  const monthFolders = await ensurePlanteaMonthFolders(accessToken, folderId, allMonthKeys);

  const nowIso = new Date().toISOString();
  const masterEnvelope = buildDriveBackupEnvelope(snapshot, nowIso);
  const masterResult = await upsertJsonFileInDriveFolder({
    accessToken,
    folderId,
    fileName: PLANTEA_DRIVE_FILE_NAME,
    contentJson: JSON.stringify(masterEnvelope, null, 2),
    existingFileId: params.existingFileId,
  });

  // Lưu bản dữ liệu riêng của từng tháng có phát sinh vào thư mục con tương ứng
  const activeMonths = collectActiveDataMonthKeys(snapshot).filter((mk) => !excludedSet.has(mk));
  for (let i = 0; i < activeMonths.length; i += 3) {
    const batch = activeMonths.slice(i, i + 3);
    await Promise.all(
      batch.map(async (monthKey) => {
        const subFolderId = monthFolders[monthKey];
        if (!subFolderId) return;
        const sliced = sliceSnapshotForMonth(snapshot, monthKey);
        const monthEnvelope = buildDriveBackupEnvelope(sliced, nowIso);
        await upsertJsonFileInDriveFolder({
          accessToken,
          folderId: subFolderId,
          fileName: formatDriveMonthFileName(monthKey),
          contentJson: JSON.stringify(monthEnvelope, null, 2),
        });
      }),
    );
  }

  return {
    linkedEmail,
    folderId,
    folderName: PLANTEA_DRIVE_FOLDER_NAME,
    fileId: masterResult.id,
    lastSyncedAt: masterResult.modifiedTime || nowIso,
    monthFolderCount: Object.keys(monthFolders).length,
  };
}
