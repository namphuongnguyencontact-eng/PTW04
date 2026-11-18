'use client';

import React, { useState } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, FileText, ArrowRight } from 'lucide-react';

interface ImportModalProps {
  onClose: () => void;
  onImportComplete: () => void;
}

export function ImportModal({ onClose, onImportComplete }: ImportModalProps) {
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const sampleCsv = `Tên sản phẩm,Danh mục,Mô tả,Từ khóa,Giá,Link Affiliate
Giá đỡ laptop nhôm tản nhiệt,Phụ kiện công nghệ,Giá đỡ nâng laptop chống mỏi cổ vai gáy,"laptop, stand, mỏi cổ, văn phòng",190000,https://shope.ee/demo1
Bình giữ nhiệt inox 316,Chăm sóc cá nhân,Bình giữ nhiệt 800ml hiển thị nhiệt độ,"bình giữ nhiệt, văn phòng, uống nước",160000,https://shope.ee/demo2`;

  const parseCsvToObjects = (csv: string) => {
    const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.replace(/^["']|["']$/g, '').trim());

    const result = [];
    for (let i = 1; i < lines.length; i++) {
      // Regex handling commas inside quotes
      const values = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
      const obj: any = {};
      headers.forEach((h, index) => {
        let val = values[index] ? values[index].replace(/^["']|["']$/g, '').trim() : '';
        if (h.includes('Tên')) obj.name = val;
        else if (h.includes('Danh mục')) obj.categoryName = val;
        else if (h.includes('Mô tả')) obj.description = val;
        else if (h.includes('Từ khóa')) obj.keywords = val;
        else if (h.includes('Giá')) obj.price = val;
        else if (h.includes('Affiliate') || h.includes('Link')) obj.affiliateUrl = val;
      });
      if (obj.name) result.push(obj);
    }
    return result;
  };

  const handlePreview = async () => {
    setError(null);
    let items: any[] = [];

    try {
      if (rawText.trim().startsWith('[') || rawText.trim().startsWith('{')) {
        const parsed = JSON.parse(rawText);
        items = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        items = parseCsvToObjects(rawText);
      }

      if (items.length === 0) {
        setError('Không thể đọc dữ liệu. Vui lòng nhập đúng định dạng CSV hoặc JSON.');
        return;
      }

      setLoading(true);
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, mode: 'preview' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi khi kiểm tra dữ liệu');
      }

      setPreviewData(data.preview);
      setStep('preview');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    setLoading(true);
    setError(null);
    try {
      let items: any[] = [];
      if (rawText.trim().startsWith('[')) {
        items = JSON.parse(rawText);
      } else {
        items = parseCsvToObjects(rawText);
      }

      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, mode: 'commit' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi khi lưu dữ liệu');
      }

      onImportComplete();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FEFAF3] rounded-2xl border border-[#84A282]/30 w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-[#84A282]/20 flex items-center justify-between bg-[#F6E2E9]/60">
          <h3 className="font-bold text-sm text-[#222B24] flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#84A282]" />
            Nhập danh sách sản phẩm hàng loạt
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#5E6D62] hover:bg-[#F6E2E9] transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 'input' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#5E6D62] uppercase">
                  Dán nội dung CSV hoặc JSON
                </span>
                <button
                  type="button"
                  onClick={() => setRawText(sampleCsv)}
                  className="text-xs text-[#84A282] hover:underline font-semibold cursor-pointer"
                >
                  Nạp dữ liệu mẫu
                </button>
              </div>

              <textarea
                rows={10}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Dán các dòng CSV hoặc mảng JSON sản phẩm..."
                className="w-full p-3 font-mono text-xs rounded-xl bg-white border border-[#84A282]/30 text-[#222B24] focus:outline-none focus:ring-1 focus:ring-[#84A282]"
              />

              <div className="p-3 bg-white rounded-xl border border-[#84A282]/15 text-xs text-[#5E6D62] space-y-1">
                <strong className="text-[#222B24] block">Các cột được hỗ trợ:</strong>
                <p>Tên sản phẩm, Danh mục, Mô tả, Từ khóa, Giá, Link Affiliate, Sàn...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-white border border-[#84A282]/20 text-center">
                  <span className="text-xs text-[#5E6D62] block">Tổng số dòng</span>
                  <span className="text-lg font-bold text-[#222B24]">
                    {previewData?.total}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                  <span className="text-xs text-emerald-700 block">Hợp lệ</span>
                  <span className="text-lg font-bold text-emerald-800">
                    {previewData?.validCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-center">
                  <span className="text-xs text-rose-700 block">Lỗi</span>
                  <span className="text-lg font-bold text-rose-800">
                    {previewData?.errorCount}
                  </span>
                </div>
              </div>

              {previewData?.errors?.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs space-y-1">
                  <strong className="text-rose-900 block">Chi tiết lỗi:</strong>
                  {previewData.errors.map((err: any, i: number) => (
                    <p key={i} className="text-rose-700">
                      • Dòng {err.row} ({err.item}): {err.error}
                    </p>
                  ))}
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold text-[#5E6D62] uppercase mb-2">
                  Xem trước 5 sản phẩm đầu tiên:
                </h4>
                <div className="space-y-2">
                  {previewData?.samples?.map((s: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-white border border-[#84A282]/20 text-xs"
                    >
                      <span className="font-bold text-[#222B24] block">{s.name}</span>
                      <span className="text-[#5E6D62]">{s.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#84A282]/20 bg-[#FEFAF3] flex justify-between items-center">
          {step === 'preview' ? (
            <button
              type="button"
              onClick={() => setStep('input')}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-white border border-[#84A282]/30 text-[#5E6D62] hover:bg-gray-50 cursor-pointer"
            >
              Quay lại chỉnh sửa
            </button>
          ) : (
            <div></div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-white border border-[#84A282]/30 text-[#5E6D62] hover:bg-gray-50 cursor-pointer"
            >
              Hủy
            </button>

            {step === 'input' ? (
              <button
                type="button"
                onClick={handlePreview}
                disabled={loading || !rawText.trim()}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-[#84A282] text-white hover:bg-[#6d8b6b] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>{loading ? 'Đang kiểm tra...' : 'Tiếp tục xem trước'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCommit}
                disabled={loading || previewData?.validCount === 0}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-[#84A282] text-white hover:bg-[#6d8b6b] transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Đang lưu...' : `Xác nhận nhập ${previewData?.validCount} sản phẩm`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
