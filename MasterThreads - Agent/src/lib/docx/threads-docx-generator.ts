import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeadingLevel,
  Packer,
  Footer,
  Header,
  PageNumber,
  ShadingType,
  ExternalHyperlink,
} from 'docx';

export interface DetailedComment {
  id?: string;
  authorUsername: string;
  authorName?: string;
  authorAvatar?: string | null;
  content: string;
  likesCount: number;
  time?: string;
  isSubReply?: boolean;
  replyToUsername?: string;
  commentUrl?: string;
}

export interface PostDetailsForExport {
  code: string;
  url: string;
  username: string;
  fullName?: string;
  avatar?: string | null;
  content: string;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  quoteCount?: number;
  viewsCount?: number | null;
  publishedAt: Date | string;
  scrapedAt?: Date | string;
  comments: DetailedComment[];
}

function formatDate(dateInput: Date | string | undefined): string {
  if (!dateInput) return 'N/A';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(dateInput);
  }
}

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString('vi-VN');
}

/**
 * Generate a high quality, beautifully formatted Word (.docx) document
 * containing all details of a Threads post and all its comments.
 */
export async function generateThreadsPostDocx(data: PostDetailsForExport): Promise<Buffer> {
  const publishedDateStr = formatDate(data.publishedAt);
  const scrapedDateStr = formatDate(data.scrapedAt || new Date());
  const comments = data.comments || [];

  // Calculate stats
  const totalCommentsScraped = comments.length;
  const totalCommentLikes = comments.reduce((acc, c) => acc + (c.likesCount || 0), 0);
  const topLikedComments = [...comments]
    .sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0))
    .slice(0, 3)
    .filter((c) => (c.likesCount || 0) > 0);

  // Table styling helpers
  const tableBorderNone = {
    top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  };

  const subtleBorder = {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
    insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
  };

  // 1. Header and Cover Title
  const titleParagraph = new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 120 },
    children: [
      new TextRun({
        text: 'BÁO CÁO CHI TIẾT BÀI VIẾT & BÌNH LUẬN THREADS',
        bold: true,
        size: 30, // 15pt
        color: '1F2937',
        font: 'Segoe UI',
      }),
    ],
  });

  const subtitleParagraph = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 350 },
    children: [
      new TextRun({
        text: 'Trích xuất tự động từ Threads • Báo cáo chi tiết nội dung & bình luận thảo luận',
        italics: true,
        size: 20, // 10pt
        color: '4B5563',
        font: 'Segoe UI',
      }),
    ],
  });

  // 2. Section Heading: Post Metadata
  const postInfoHeading = new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 150 },
    children: [
      new TextRun({
        text: '1. THÔNG TIN BÀI VIẾT GỐC',
        bold: true,
        size: 24, // 12pt
        color: '1E3A2F',
        font: 'Segoe UI',
      }),
    ],
  });

  // Metadata Table: 4 columns or 2 columns
  const metaRows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Tác giả bài viết', bold: true, size: 19, font: 'Segoe UI' })] })],
        }),
        new TableCell({
          width: { size: 75, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `@${data.username}`, bold: true, color: '0284C7', size: 20, font: 'Segoe UI' }),
                new TextRun({ text: data.fullName && data.fullName !== data.username ? ` (${data.fullName})` : '', size: 19, color: '4B5563', font: 'Segoe UI' }),
              ],
            }),
          ],
        }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Đường dẫn gốc (URL)', bold: true, size: 19, font: 'Segoe UI' })] })],
        }),
        new TableCell({
          width: { size: 75, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [
                new ExternalHyperlink({
                  children: [
                    new TextRun({
                      text: data.url,
                      color: '2563EB',
                      underline: {},
                      size: 19,
                      font: 'Segoe UI',
                    }),
                  ],
                  link: data.url,
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Thời gian đăng bài', bold: true, size: 19, font: 'Segoe UI' })] })],
        }),
        new TableCell({
          width: { size: 75, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: publishedDateStr, size: 19, font: 'Segoe UI' })] })],
        }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Chỉ số tương tác', bold: true, size: 19, font: 'Segoe UI' })] })],
        }),
        new TableCell({
          width: { size: 75, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `❤️ ${formatNumber(data.likeCount)} thích`, bold: true, color: 'DC2626', size: 19, font: 'Segoe UI' }),
                new TextRun({ text: `   •   💬 ${formatNumber(data.replyCount)} bình luận`, bold: true, color: '2563EB', size: 19, font: 'Segoe UI' }),
                new TextRun({ text: `   •   🔁 ${formatNumber(data.repostCount)} chia sẻ`, bold: true, color: '059669', size: 19, font: 'Segoe UI' }),
                ...(data.viewsCount ? [new TextRun({ text: `   •   👁️ ${formatNumber(data.viewsCount)} xem`, size: 19, font: 'Segoe UI' })] : []),
              ],
            }),
          ],
        }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Thời điểm trích xuất', bold: true, size: 19, font: 'Segoe UI' })] })],
        }),
        new TableCell({
          width: { size: 75, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: `${scrapedDateStr} (GMT+7)`, size: 19, font: 'Segoe UI' })] })],
        }),
      ],
    }),
  ];

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: subtleBorder,
    rows: metaRows,
  });

  // 3. Post Content Box
  const contentHeading = new Paragraph({
    spacing: { before: 240, after: 100 },
    children: [
      new TextRun({
        text: 'Nội dung bài viết:',
        bold: true,
        size: 21,
        color: '374151',
        font: 'Segoe UI',
      }),
    ],
  });

  // Split content into clean paragraphs
  const contentLines = (data.content || '').split('\n').filter((l) => l.trim() !== '');
  const contentParagraphs =
    contentLines.length > 0
      ? contentLines.map(
          (line) =>
            new Paragraph({
              spacing: { after: 100 },
              children: [
                new TextRun({
                  text: line,
                  size: 21,
                  font: 'Segoe UI',
                  color: '111827',
                }),
              ],
            })
        )
      : [
          new Paragraph({
            children: [
              new TextRun({
                text: '(Không có văn bản hoặc bài viết dạng hình ảnh/video)',
                italics: true,
                color: '6B7280',
                size: 20,
              }),
            ],
          }),
        ];

  // Boxed Callout for Post Content
  const postContentBox = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      left: { style: BorderStyle.SINGLE, size: 24, color: '84A282' }, // thick green border
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: 'F9FAF9' },
            margins: { top: 160, bottom: 160, left: 240, right: 160 },
            children: contentParagraphs,
          }),
        ],
      }),
    ],
  });

  // 4. Comments Summary Section
  const commentsSummaryHeading = new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 350, after: 150 },
    children: [
      new TextRun({
        text: '2. TỔNG QUAN BÌNH LUẬN & THẢO LUẬN',
        bold: true,
        size: 24,
        color: '1E3A2F',
        font: 'Segoe UI',
      }),
    ],
  });

  const summaryStatsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: subtleBorder,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Tổng số bình luận đã quét', bold: true, size: 19, font: 'Segoe UI' })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 60 },
                children: [
                  new TextRun({
                    text: `${totalCommentsScraped} / ${data.replyCount}`,
                    bold: true,
                    size: 26,
                    color: '059669',
                    font: 'Segoe UI',
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Tổng lượt thích bình luận', bold: true, size: 19, font: 'Segoe UI' })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 60 },
                children: [
                  new TextRun({
                    text: `${formatNumber(totalCommentLikes)} ❤️`,
                    bold: true,
                    size: 26,
                    color: 'DC2626',
                    font: 'Segoe UI',
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 34, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Tỷ lệ thu thập', bold: true, size: 19, font: 'Segoe UI' })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 60 },
                children: [
                  new TextRun({
                    text: data.replyCount > 0 ? `${Math.min(100, Math.round((totalCommentsScraped / data.replyCount) * 100))}%` : '100%',
                    bold: true,
                    size: 26,
                    color: '2563EB',
                    font: 'Segoe UI',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // 5. Detailed Comments Section
  const commentsListHeading = new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 350, after: 150 },
    children: [
      new TextRun({
        text: `3. CHI TIẾT TẤT CẢ BÌNH LUẬN (${totalCommentsScraped} BÌNH LUẬN)`,
        bold: true,
        size: 24,
        color: '1E3A2F',
        font: 'Segoe UI',
      }),
    ],
  });

  // Generate Table for comments
  const commentRows: TableRow[] = [];

  // Table header
  commentRows.push(
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: 8, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: '84A282' },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'STT', bold: true, color: 'FFFFFF', size: 18, font: 'Segoe UI' })] })],
        }),
        new TableCell({
          width: { size: 22, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: '84A282' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Người bình luận', bold: true, color: 'FFFFFF', size: 18, font: 'Segoe UI' })] })],
        }),
        new TableCell({
          width: { size: 55, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: '84A282' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Nội dung bình luận', bold: true, color: 'FFFFFF', size: 18, font: 'Segoe UI' })] })],
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: '84A282' },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Lượt thích', bold: true, color: 'FFFFFF', size: 18, font: 'Segoe UI' })] })],
        }),
      ],
    })
  );

  if (comments.length === 0) {
    commentRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 4,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 120, after: 120 },
                children: [
                  new TextRun({
                    text: 'Chưa có bình luận nào trên bài viết này hoặc các bình luận bị giới hạn hiển thị.',
                    italics: true,
                    color: '6B7280',
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  } else {
    comments.forEach((c, idx) => {
      const isEven = idx % 2 === 0;
      const rowFill = isEven ? 'FFFFFF' : 'F9FAF9';

      const commentLines = (c.content || '').split('\n').filter((l) => l.trim().length > 0);
      const commentParagraphs = commentLines.map(
        (line, lineIdx) =>
          new Paragraph({
            spacing: { after: lineIdx === commentLines.length - 1 ? 40 : 80 },
            children: [
              ...(c.isSubReply
                ? [
                    new TextRun({
                      text: '↳ ',
                      bold: true,
                      color: '059669',
                      size: 19,
                    }),
                  ]
                : []),
              new TextRun({
                text: line,
                size: 20,
                font: 'Segoe UI',
                color: '1F2937',
              }),
            ],
          })
      );

      commentRows.push(
        new TableRow({
          children: [
            // STT
            new TableCell({
              width: { size: 8, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: rowFill },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: `#${idx + 1}`, bold: true, size: 19, color: '4B5563', font: 'Segoe UI' })],
                }),
              ],
            }),
            // Author
            new TableCell({
              width: { size: 22, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: rowFill },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `@${c.authorUsername}`,
                      bold: true,
                      color: '0284C7',
                      size: 19,
                      font: 'Segoe UI',
                    }),
                  ],
                }),
                ...(c.time
                  ? [
                      new Paragraph({
                        spacing: { before: 30 },
                        children: [
                          new TextRun({
                            text: formatDate(c.time),
                            size: 16,
                            color: '6B7280',
                            font: 'Segoe UI',
                          }),
                        ],
                      }),
                    ]
                  : []),
              ],
            }),
            // Content
            new TableCell({
              width: { size: 55, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: rowFill },
              children: [
                ...(commentParagraphs.length > 0
                  ? commentParagraphs
                  : [
                      new Paragraph({
                        children: [
                          new TextRun({ text: '(Nội dung trống)', size: 19, italics: true }),
                        ],
                      }),
                    ]),
                ...(c.commentUrl
                  ? [
                      new Paragraph({
                        spacing: { before: 80 },
                        children: [
                          new TextRun({
                            text: '🔗 Nguồn: ',
                            size: 16,
                            bold: true,
                            color: '6B7280',
                            font: 'Segoe UI',
                          }),
                          new ExternalHyperlink({
                            children: [
                              new TextRun({
                                text: c.commentUrl,
                                color: '0284C7',
                                underline: {},
                                size: 16,
                                font: 'Segoe UI',
                              }),
                            ],
                            link: c.commentUrl,
                          }),
                        ],
                      }),
                    ]
                  : []),
              ],
            }),
            // Likes
            new TableCell({
              width: { size: 15, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: rowFill },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: c.likesCount > 0 ? `❤️ ${formatNumber(c.likesCount)}` : '0',
                      bold: c.likesCount > 0,
                      color: c.likesCount > 0 ? 'DC2626' : '9CA3AF',
                      size: 19,
                      font: 'Segoe UI',
                    }),
                  ],
                }),
              ],
            }),
          ],
        })
      );
    });
  }

  const commentsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: subtleBorder,
    rows: commentRows,
  });

  // Footer & Disclaimer Paragraph
  const footerNote = new Paragraph({
    spacing: { before: 300, after: 100 },
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: 'Báo cáo được khởi tạo tự động bởi MasterThreads Intelligence. Dữ liệu phản ánh trạng thái bài viết tại thời điểm trích xuất.',
        italics: true,
        size: 17,
        color: '9CA3AF',
        font: 'Segoe UI',
      }),
    ],
  });

  // Construct Document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'MasterThreads Intelligence  |  threads.net/@' + data.username,
                    size: 16,
                    color: '9CA3AF',
                    font: 'Segoe UI',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'Trang ',
                    size: 18,
                    color: '6B7280',
                    font: 'Segoe UI',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    color: '6B7280',
                    font: 'Segoe UI',
                  }),
                  new TextRun({
                    text: ' / ',
                    size: 18,
                    color: '6B7280',
                    font: 'Segoe UI',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 18,
                    color: '6B7280',
                    font: 'Segoe UI',
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          titleParagraph,
          subtitleParagraph,
          postInfoHeading,
          metaTable,
          contentHeading,
          postContentBox,
          commentsSummaryHeading,
          summaryStatsTable,
          commentsListHeading,
          commentsTable,
          footerNote,
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
