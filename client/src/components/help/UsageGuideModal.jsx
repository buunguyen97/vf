import { Copy, ExternalLink, Link2, X } from 'lucide-react';

const guideSteps = [
  {
    id: 1,
    title: 'Mở tuyến đường rồi nhấn chia sẻ',
    description:
      'Sau khi đã có tuyến đường trên Google Maps, nhấn vào biểu tượng chia sẻ / chuyển tiếp như hình.',
    image: '/guide/hd-1.jpg',
    icon: Link2,
  },
  {
    id: 2,
    title: 'Chọn Sao chép link',
    description:
      'Trong bảng chia sẻ hiện ra, chọn mục Sao chép để copy link Google Maps.',
    image: '/guide/hd-3.jpg',
    icon: ExternalLink,
  },
  {
    id: 3,
    title: 'Dán vào app rồi nhấn Phân tích',
    description:
      'Quay lại app, nhấn Dán để đưa link vào ô Google Maps, sau đó bấm Phân tích.',
    image: '/guide/hd-2.jpg',
    icon: Copy,
  },
];

export default function UsageGuideModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2600] flex items-start justify-center overflow-y-auto bg-black/70 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-[calc(env(safe-area-inset-top)+72px)] backdrop-blur-sm md:items-center md:px-3 md:py-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-[min(94dvh,860px)] w-full max-w-[720px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0B0B0B] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/8 bg-[#0B0B0B] px-4 pb-4 pt-5 md:px-5 md:pt-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#00B14F]/80 md:text-[11px]">
              Hướng dẫn nhanh
            </p>
            <h3 className="mt-1 text-base font-bold text-white md:text-lg">
              Cách lấy link Google Maps để dán vào app
            </h3>
            <p className="mt-1 text-xs leading-5 text-white/58 md:text-sm">
              Chỉ cần làm 3 bước: chia sẻ tuyến đường, sao chép link, rồi dán vào app để phân tích.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/70 transition-colors hover:bg-white/12 hover:text-white"
            aria-label="Đóng hướng dẫn"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5">
          <div className="space-y-4">
            {guideSteps.map(({ id, title, description, image, icon: Icon }) => (
              <div
                key={id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-[#111111]"
              >
                <div className="flex items-start gap-3 border-b border-white/6 px-3 py-3 md:px-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1464F4]/18 text-[#73A4FF]">
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[#00B14F]/14 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#74E3A3]">
                        Bước {id}
                      </span>
                    </div>
                    <h4 className="mt-2 text-sm font-bold text-white md:text-[15px]">
                      {title}
                    </h4>
                    <p className="mt-1 text-xs leading-5 text-white/62 md:text-sm">
                      {description}
                    </p>
                  </div>
                </div>

                <div className="bg-black/25 p-2.5 md:p-3">
                  <img
                    src={image}
                    alt={title}
                    className="w-full rounded-[18px] border border-white/8 object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-[#22c55e]/20 bg-[#22c55e]/10 px-4 py-3">
            <p className="text-sm font-semibold text-white">
              Xong rồi thì làm tiếp:
            </p>
            <p className="mt-1 text-xs leading-5 text-white/68 md:text-sm">
              Sau khi app hiện ra <span className="font-bold text-white">Điểm Đi</span> và{' '}
              <span className="font-bold text-white">Điểm Đến</span>, bạn chỉ cần bấm{' '}
              <span className="font-bold text-[#74E3A3]">Gợi Ý Trạm Sạc</span>.
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-white/8 bg-[#0B0B0B] px-4 py-3 md:px-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-white/12"
          >
            Đóng hướng dẫn
          </button>
        </div>
      </div>
    </div>
  );
}
