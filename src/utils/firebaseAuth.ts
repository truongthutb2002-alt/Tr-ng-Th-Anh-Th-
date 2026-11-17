import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'] as const;

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Lưu token CHỈ trong bộ nhớ RAM (không lưu vào localStorage / sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedUserEmail: string | null = null;

function createGoogleDriveProvider(loginHintEmail?: string): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of SCOPES) {
    provider.addScope(scope);
  }
  const params: Record<string, string> = {
    prompt: 'consent',
  };
  if (loginHintEmail && loginHintEmail.trim()) {
    params.login_hint = loginHintEmail.trim();
  }
  provider.setCustomParameters(params);
  return provider;
}

export function initDriveAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthCleared?: () => void,
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      cachedUserEmail = user.email ?? cachedUserEmail;
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthCleared?.();
      }
    } else {
      cachedAccessToken = null;
      cachedUserEmail = null;
      onAuthCleared?.();
    }
  });
}

export async function signInWithGoogleForDrive(loginHintEmail?: string): Promise<{
  user: User;
  accessToken: string;
  email: string;
}> {
  isSigningIn = true;
  try {
    const provider = createGoogleDriveProvider(loginHintEmail);
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không nhận được quyền truy cập Google Drive từ tài khoản Google.');
    }
    cachedAccessToken = credential.accessToken;
    cachedUserEmail = result.user.email || loginHintEmail?.trim() || '';
    return {
      user: result.user,
      accessToken: cachedAccessToken,
      email: cachedUserEmail,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Bạn đã đóng cửa sổ cấp phép Google Drive trước khi hoàn tất.');
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Trình duyệt đang chặn cửa sổ bật lên. Vui lòng cho phép popup để cấp quyền Google Drive.');
    }
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Không thể liên kết Google Drive lúc này.');
  } finally {
    isSigningIn = false;
  }
}

export async function getDriveAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

export function getCachedDriveUserEmail(): string | null {
  return cachedUserEmail;
}

export function clearInMemoryDriveToken(): void {
  cachedAccessToken = null;
}

export async function logoutGoogleDrive(): Promise<void> {
  cachedAccessToken = null;
  cachedUserEmail = null;
  await auth.signOut();
}
