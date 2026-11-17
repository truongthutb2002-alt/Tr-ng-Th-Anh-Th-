import { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        aria-label="Cài đặt ứng dụng Plantea về máy"
        title="Cài đặt Plantea để dùng ngoại tuyến như ứng dụng"
        className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-2xl bg-[#E11D64] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#BE185D] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Cài ứng dụng</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Hướng dẫn cài đặt Plantea trên iOS"
          className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-2xl border border-[#F39EC1] bg-white px-2.5 py-1.5 text-xs font-bold text-[#9D174D] hover:bg-[#FFE3EE] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
        >
          <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Cài iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D1A2B]/40 p-4 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-guide-title"
          >
            <div className="w-full max-w-sm rounded-3xl border border-[#F5BDD6] bg-white p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3
                  id="ios-install-guide-title"
                  className="text-base font-extrabold text-[#3D1A2B]"
                >
                  Cài đặt Plantea trên iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Đóng hướng dẫn cài đặt"
                  className="rounded-xl p-1 text-[#7C5266] hover:bg-[#FFE3EE] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs font-semibold text-[#5C4B54] leading-relaxed">
                1. Nhấn nút <strong className="text-[#9D174D]">Chia sẻ (Share)</strong> trên thanh công cụ Safari.
                <br />
                2. Cuộn xuống và chọn{' '}
                <strong className="text-[#9D174D]">Thêm vào Màn hình chính (Add to Home Screen)</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-2xl bg-[#E11D64] py-2 text-xs font-bold text-white hover:bg-[#BE185D] cursor-pointer"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
