// Table.tsx
// Version: 1.0.0
// A comprehensive table component implementing Material Design 3.0 specifications
// with virtualized scrolling and accessibility features.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classnames from 'classnames'; // v2.3+
import { useVirtual } from 'react-virtual'; // v2.10+
import { debounce } from 'lodash'; // v4.17+
import { Pagination, PaginationProps } from './Pagination';
import { Loading } from './Loading';
import { Button } from './Button';

// Constants for table configuration
const SORT_DIRECTIONS = {
  asc: 'asc',
  desc: 'desc',
} as const;

const DEFAULT_PAGE_SIZE = 10;
const VIRTUALIZATION_CONFIG = { itemHeight: 48, overscan: 5 };
const DEBOUNCE_DELAY = 150;
const MIN_TOUCH_TARGET_SIZE = 44;

// Default ARIA labels
const ARIA_LABELS = {
  sortAscending: 'Sort ascending',
  sortDescending: 'Sort descending',
  loading: 'Loading table data...',
  noData: 'No data available',
  rowSelected: 'Row selected',
  columnHeader: 'Column header',
};

// Type definitions
export interface TableColumn<T = any> {
  key: string;
  title: string;
  sortable?: boolean;
  width?: string;
  minWidth?: number;
  render?: (value: any, row: T) => React.ReactNode;
  cellProps?: React.TdHTMLAttributes<HTMLTableCellElement>;
  headerProps?: React.ThHTMLAttributes<HTMLTableHeaderCellElement>;
  sortDirection?: keyof typeof SORT_DIRECTIONS;
  resizable?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface TableProps<T = any> {
  data: T[];
  columns: TableColumn<T>[];
  className?: string;
  loading?: boolean;
  sortable?: boolean;
  paginated?: boolean;
  pageSize?: number;
  emptyMessage?: string;
  stickyHeader?: boolean;
  virtualScroll?: boolean;
  rowKeyField?: string;
  headerClassName?: string;
  rowClassName?: string | ((row: T) => string);
  rtl?: boolean;
  ariaLabels?: Partial<typeof ARIA_LABELS>;
  onSort?: (key: string, direction: keyof typeof SORT_DIRECTIONS) => void;
  onPageChange?: (page: number, metadata: { totalPages: number }) => void;
  onRowClick?: (row: T, event: React.MouseEvent) => void;
  customSort?: (data: T[], key: string, direction: keyof typeof SORT_DIRECTIONS) => T[];
}

/**
 * Enhanced table component with virtualization and accessibility features
 */
const Table = <T extends Record<string, any>>({
  data,
  columns,
  className,
  loading = false,
  sortable = true,
  paginated = false,
  pageSize = DEFAULT_PAGE_SIZE,
  emptyMessage = ARIA_LABELS.noData,
  stickyHeader = false,
  virtualScroll = false,
  rowKeyField = 'id',
  headerClassName,
  rowClassName,
  rtl = false,
  ariaLabels = {},
  onSort,
  onPageChange,
  onRowClick,
  customSort,
}: TableProps<T>): JSX.Element => {
  // Merge ARIA labels with defaults
  const labels = { ...ARIA_LABELS, ...ariaLabels };

  // Refs for virtualization and focus management
  const tableRef = useRef<HTMLTableElement>(null);
  const headerRef = useRef<HTMLTableSectionElement>(null);

  // State management
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: keyof typeof SORT_DIRECTIONS;
  } | null>(null);

  // Virtual scroll configuration
  const rowVirtualizer = useVirtual({
    size: data.length,
    parentRef: tableRef,
    estimateSize: useCallback(() => VIRTUALIZATION_CONFIG.itemHeight, []),
    overscan: VIRTUALIZATION_CONFIG.overscan,
    enabled: virtualScroll,
  });

  // Memoized sorted and paginated data
  const processedData = useMemo(() => {
    let result = [...data];

    // Apply sorting
    if (sortConfig && (customSort || sortable)) {
      result = customSort
        ? customSort(result, sortConfig.key, sortConfig.direction)
        : result.sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            return sortConfig.direction === 'asc'
              ? aVal > bVal ? 1 : -1
              : aVal < bVal ? 1 : -1;
          });
    }

    // Apply pagination
    if (paginated) {
      const start = (currentPage - 1) * pageSize;
      result = result.slice(start, start + pageSize);
    }

    return result;
  }, [data, sortConfig, currentPage, pageSize, customSort, sortable, paginated]);

  // Debounced sort handler
  const handleSort = useCallback(
    debounce((key: string) => {
      const direction = sortConfig?.key === key && sortConfig.direction === 'asc'
        ? 'desc'
        : 'asc';
      setSortConfig({ key, direction });
      onSort?.(key, direction);
    }, DEBOUNCE_DELAY),
    [sortConfig, onSort]
  );

  // Page change handler
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    onPageChange?.(page, {
      totalPages: Math.ceil(data.length / pageSize),
    });
  }, [data.length, pageSize, onPageChange]);

  // Row click handler with keyboard support
  const handleRowClick = useCallback((row: T, event: React.MouseEvent) => {
    if (onRowClick) {
      onRowClick(row, event);
    }
  }, [onRowClick]);

  // Generate table classes
  const tableClasses = classnames(
    'table',
    'w-full',
    'border-collapse',
    'text-left',
    {
      'sticky-header': stickyHeader,
      'rtl': rtl,
    },
    className
  );

  return (
    <div className="relative overflow-hidden">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/50 z-10">
          <Loading
            center
            size="large"
            label={labels.loading}
          />
        </div>
      )}

      {/* Main table */}
      <table
        ref={tableRef}
        className={tableClasses}
        role="grid"
        aria-busy={loading}
        aria-rowcount={data.length}
      >
        {/* Table header */}
        <thead
          ref={headerRef}
          className={classnames(
            'bg-gray-50',
            { 'sticky top-0 z-1': stickyHeader },
            headerClassName
          )}
        >
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={classnames(
                  'px-4 py-2',
                  'font-semibold',
                  'text-gray-700',
                  'border-b',
                  'border-gray-200',
                  {
                    'cursor-pointer': column.sortable && sortable,
                    [`text-${column.align || 'left'}`]: true,
                  }
                )}
                style={{
                  width: column.width,
                  minWidth: Math.max(column.minWidth || 0, MIN_TOUCH_TARGET_SIZE),
                }}
                onClick={() => column.sortable && sortable && handleSort(column.key)}
                {...column.headerProps}
                role="columnheader"
                aria-sort={
                  sortConfig?.key === column.key
                    ? sortConfig.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                <div className="flex items-center gap-2">
                  <span>{column.title}</span>
                  {column.sortable && sortable && (
                    <Button
                      variant="text"
                      size="small"
                      ariaLabel={
                        sortConfig?.key === column.key && sortConfig.direction === 'asc'
                          ? labels.sortDescending
                          : labels.sortAscending
                      }
                    >
                      {sortConfig?.key === column.key ? (
                        sortConfig.direction === 'asc' ? '↑' : '↓'
                      ) : '↕'}
                    </Button>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        {/* Table body */}
        <tbody>
          {processedData.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-center py-8 text-gray-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            virtualScroll ? (
              rowVirtualizer.virtualItems.map((virtualRow) => {
                const row = processedData[virtualRow.index];
                return (
                  <tr
                    key={row[rowKeyField]}
                    className={classnames(
                      'hover:bg-gray-50',
                      'transition-colors',
                      typeof rowClassName === 'function'
                        ? rowClassName(row)
                        : rowClassName
                    )}
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={(e) => handleRowClick(row, e)}
                    role="row"
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={classnames(
                          'px-4 py-2',
                          'border-b',
                          'border-gray-200',
                          `text-${column.align || 'left'}`
                        )}
                        {...column.cellProps}
                        role="gridcell"
                      >
                        {column.render
                          ? column.render(row[column.key], row)
                          : row[column.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              processedData.map((row) => (
                <tr
                  key={row[rowKeyField]}
                  className={classnames(
                    'hover:bg-gray-50',
                    'transition-colors',
                    typeof rowClassName === 'function'
                      ? rowClassName(row)
                      : rowClassName
                  )}
                  onClick={(e) => handleRowClick(row, e)}
                  role="row"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={classnames(
                        'px-4 py-2',
                        'border-b',
                        'border-gray-200',
                        `text-${column.align || 'left'}`
                      )}
                      {...column.cellProps}
                      role="gridcell"
                    >
                      {column.render
                        ? column.render(row[column.key], row)
                        : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {paginated && data.length > 0 && (
        <div className="mt-4">
          <Pagination
            totalItems={data.length}
            itemsPerPage={pageSize}
            currentPage={currentPage}
            onPageChange={handlePageChange}
            rtl={rtl}
          />
        </div>
      )}
    </div>
  );
};

export default Table;