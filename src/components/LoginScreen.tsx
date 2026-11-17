import { useState, type FormEvent } from 'react';
import { validateLoginInput, validateRegistrationInput } from '../utils/schedule';
import { validateEmailInput } from '../utils/snapshotSync';
import { CalendarHeart, FolderHeart, LogIn, Mail, Phone, User, UserPlus } from 'lucide-react';
import { PlanteaWordmark } from './PlanteaWordmark';
import { GoogleSignInButton } from './GoogleSignInButton';

const PLANTEA_LOGO_SRC = '/assets/aistudio/M_y_Kawaii_v__Logo_Plantea_f1107575.png';

interface LoginScreenProps {
  onLogin: (username: string, phone: string, email: string) => Promise<void>;
  onRegister: (username: string, phone: string, confirmPhone: string, email: string) => Promise<void>;
  onGoogleDriveLogin: (params: { email: string; username: string; phone: string }) => Promise<void>;
  initialUsername?: string;
  initialEmail?: string;
}

type AuthTabMode = 'login' | 'register';

export function LoginScreen({
  onLogin,
  onRegister,
  onGoogleDriveLogin,
  initialUsername = '',
  initialEmail = '',
}: LoginScreenProps) {
  const [mode, setMode] = useState<AuthTabMode>('login');
  const [username, setUsername] = useState(initialUsername);
  const [phone, setPhone] = useState('');
  const [confirmPhone, setConfirmPhone] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLinkingDrive, setIsLinkingDrive] = useState(false);
  const [imgError, setImgError] = useState(false);

  const switchMode = (nextMode: AuthTabMode) => {
    setMode(nextMode);
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const emailErr = validateEmailInput(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }

    if (mode === 'login') {
      const validationErrors = validateLoginInput({ username, phone });
      const firstErr = Object.values(validationErrors)[0];
      if (firstErr) {
        setError(firstErr);
        return;
      }
      setError('');
      setIsSubmitting(true);
      try {
        await onLogin(username.trim(), phone.trim(), email.trim());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Đăng nhập thất bại. Vui lòng thử lại.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const validationErrors = validateRegistrationInput({ username, phone, confirmPhone });
    const firstErr = Object.values(validationErrors)[0];
    if (firstErr) {
      setError(firstErr);
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await onRegister(username.trim(), phone.trim(), confirmPhone.trim(), email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo tài khoản thất bại. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleDriveClick = async () => {
    const emailErr = validateEmailInput(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    setError('');
    setIsLinkingDrive(true);
    try {
      await onGoogleDriveLogin({
        email: email.trim(),
        username: username.trim(),
        phone: phone.trim(),
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể liên kết Google Drive lúc này.',
      );
    } finally {
      setIsLinkingDrive(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF4F8] px-4 py-8 text-[#3D1A2B]">
      <div className="w-full max-w-md rounded-3xl border border-[#F5BDD6] bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          {!imgError ? (
            <img
              src={PLANTEA_LOGO_SRC}
              alt="Biểu tượng Plantea"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-20 w-20 rounded-3xl border-2 border-[#F39EC1] object-cover shadow-xs"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border-2 border-[#F39EC1] bg-[#FFE3EE] text-[#E11D64]">
              <CalendarHeart className="h-9 w-9" aria-hidden="true" />
            </div>
          )}

          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-[#3D1A2B]">
            {mode === 'login' ? 'Đăng nhập ' : 'Tạo tài khoản '}
            <PlanteaWordmark />
          </h1>
          <p className="mt-1.5 text-sm font-medium text-[#7C5266] text-balance">
            {mode === 'login'
              ? 'Nhập tên đăng nhập, số điện thoại và email liên kết Google Drive để mở và bảo vệ dữ liệu của bạn.'
              : 'Tạo tài khoản mới và liên kết email Google Drive để lưu trữ riêng mọi lịch trình, thu nhập và học phí.'}
          </p>
        </div>

        {/* Segmented Tab Switcher: Đăng nhập / Tạo tài khoản */}
        <div
          role="tablist"
          aria-label="Chọn hình thức truy cập tài khoản"
          className="mt-6 grid grid-cols-2 gap-1.5 rounded-2xl border border-[#F5BDD6] bg-[#FFF0F6] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => switchMode('login')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] ${
              mode === 'login'
                ? 'bg-white text-[#9D174D] shadow-xs'
                : 'text-[#7C5266] hover:text-[#3D1A2B]'
            }`}
          >
            <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Đăng nhập</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            onClick={() => switchMode('register')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] ${
              mode === 'register'
                ? 'bg-white text-[#9D174D] shadow-xs'
                : 'text-[#7C5266] hover:text-[#3D1A2B]'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tạo tài khoản</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor={mode === 'login' ? 'login-username' : 'register-username'}
              className="block text-xs font-bold text-[#7C5266] mb-1.5"
            >
              Tên đăng nhập
            </label>
            <div className="relative">
              <User
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B48EA0]"
                aria-hidden="true"
              />
              <input
                id={mode === 'login' ? 'login-username' : 'register-username'}
                type="text"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Ví dụ: Minh Anh hoặc tên tài khoản..."
                className="w-full rounded-2xl border border-[#F5BDD6] bg-[#FFF8FB] py-2.5 pl-10 pr-4 text-sm font-semibold text-[#3D1A2B] placeholder:font-normal placeholder:text-[#B48EA0] focus:border-[#E11D64] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E11D64]/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={mode === 'login' ? 'login-phone' : 'register-phone'}
              className="block text-xs font-bold text-[#7C5266] mb-1.5"
            >
              Số điện thoại
            </label>
            <div className="relative">
              <Phone
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B48EA0]"
                aria-hidden="true"
              />
              <input
                id={mode === 'login' ? 'login-phone' : 'register-phone'}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Ví dụ: 0912345678"
                className="w-full rounded-2xl border border-[#F5BDD6] bg-[#FFF8FB] py-2.5 pl-10 pr-4 text-sm font-semibold text-[#3D1A2B] placeholder:font-normal placeholder:text-[#B48EA0] focus:border-[#E11D64] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E11D64]/20"
              />
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label
                htmlFor="register-confirm-phone"
                className="block text-xs font-bold text-[#7C5266] mb-1.5"
              >
                Nhập lại số điện thoại
              </label>
              <div className="relative">
                <Phone
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B48EA0]"
                  aria-hidden="true"
                />
                <input
                  id="register-confirm-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={confirmPhone}
                  onChange={(e) => {
                    setConfirmPhone(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Nhập lại chính xác số điện thoại"
                  className="w-full rounded-2xl border border-[#F5BDD6] bg-[#FFF8FB] py-2.5 pl-10 pr-4 text-sm font-semibold text-[#3D1A2B] placeholder:font-normal placeholder:text-[#B48EA0] focus:border-[#E11D64] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E11D64]/20"
                />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor={mode === 'login' ? 'login-email' : 'register-email'}
              className="block text-xs font-bold text-[#7C5266] mb-1.5"
            >
              Địa chỉ Email (liên kết Google Drive)
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B48EA0]"
                aria-hidden="true"
              />
              <input
                id={mode === 'login' ? 'login-email' : 'register-email'}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Ví dụ: tenban@gmail.com"
                className="w-full rounded-2xl border border-[#F5BDD6] bg-[#FFF8FB] py-2.5 pl-10 pr-4 text-sm font-semibold text-[#3D1A2B] placeholder:font-normal placeholder:text-[#B48EA0] focus:border-[#E11D64] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E11D64]/20"
              />
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-2xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2 text-xs font-semibold text-[#BE123C]"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isLinkingDrive}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#E11D64] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#BE185D] disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] focus-visible:ring-offset-2"
          >
            {mode === 'login' ? (
              <>
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span>{isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</span>
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                <span>{isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}</span>
              </>
            )}
          </button>
        </form>

        {/* Liên kết trực tiếp với Google Drive */}
        <div className="mt-5 border-t border-[#F6DCE7] pt-4 space-y-3">
          <div className="rounded-2xl border border-[#F0C6D8] bg-[#FFF8FB] p-3.5 space-y-2.5">
            <div className="flex items-start gap-2 text-xs font-semibold text-[#5C4B54]">
              <FolderHeart className="h-4 w-4 shrink-0 text-[#E11D64] mt-0.5" aria-hidden="true" />
              <span>
                Liên kết Google Drive để cấp phép và tạo thư mục{' '}
                <strong className="text-[#9D174D]">Plantea</strong> lưu trữ dữ liệu an toàn.
              </span>
            </div>

            <GoogleSignInButton
              label={
                isLinkingDrive
                  ? 'Đang xin cấp phép Google Drive...'
                  : 'Sign in with Google'
              }
              disabled={isSubmitting || isLinkingDrive}
              onClick={handleGoogleDriveClick}
              className="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
