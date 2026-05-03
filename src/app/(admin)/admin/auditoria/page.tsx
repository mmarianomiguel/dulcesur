"use client";

import React, { useEffect, useState, useCallback } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Filter,
} from "lucide-react";

interface AuditLog {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name: string;
  action: string;
  module: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

const PAGE_SIZE = 50;

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800 border-green-200",
  UPDATE: "bg-blue-100 text-blue-800 border-blue-200",
  DELETE: "bg-red-100 text-red-800 border-red-200",
  LOGIN: "bg-gray-100 text-gray-800 border-gray-200",
  ANULACION: "bg-orange-100 text-orange-800 border-orange-200",
  BACKUP: "bg-purple-100 text-purple-800 border-purple-200",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Filters
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [moduloFilter, setModuloFilter] = useState("all");
  const [accionFilter, setAccionFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");

  // Dropdown options
  const [modulos, setModulos] = useState<string[]>([]);
  const [acciones, setAcciones] = useState<string[]>([]);

  const fetchOptions = useCallback(async () => {
    const { data: modData } = await supabase
      .from("audit_logs")
      .select("module")
      .order("module");
    if (modData) {
      const unique = [...new Set(modData.map((r: { module: string }) => r.module).filter(Boolean))];
      setModulos(unique);
    }

    const { data: accData } = await supabase
      .from("audit_logs")
      .select("action")
      .order("action");
    if (accData) {
      const unique = [...new Set(accData.map((r: { action: string }) => r.action).filter(Boolean))];
      setAcciones(unique);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (fechaDesde) {
        query = query.gte("created_at", `${fechaDesde}T00:00:00`);
      }
      if (fechaHasta) {
        query = query.lte("created_at", `${fechaHasta}T23:59:59`);
      }
      if (moduloFilter && moduloFilter !== "all") {
        query = query.eq("module", moduloFilter);
      }
      if (accionFilter && accionFilter !== "all") {
        query = query.eq("action", accionFilter);
      }
      if (userSearch.trim()) {
        query = query.ilike("user_name", `%${userSearch.trim()}%`);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, [page, fechaDesde, fechaHasta, moduloFilter, accionFilter, userSearch]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleFilterReset = () => {
    setFechaDesde("");
    setFechaHasta("");
    setModuloFilter("all");
    setAccionFilter("all");
    setUserSearch("");
    setPage(0);
  };

  const handleSearch = () => {
    setPage(0);
    fetchLogs();
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Historial de Auditoría</h1>
            <p className="text-sm text-muted-foreground">
              Registro de todas las acciones realizadas en el sistema
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-sm">
          {totalCount} registros
        </Badge>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Desde</label>
              <DateInput
                value={fechaDesde}
                onChange={setFechaDesde}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Hasta</label>
              <DateInput
                value={fechaHasta}
                onChange={setFechaHasta}
              />
            </div>
            <SearchableSelect
              label="Módulo"
              value={moduloFilter}
              onChange={(v) => setModuloFilter(v)}
              allLabel="Todos los módulos"
              options={modulos.map((m) => ({ value: m, label: m }))}
            />
            <SearchableSelect
              label="Acción"
              value={accionFilter}
              onChange={(v) => setAccionFilter(v)}
              allLabel="Todas las acciones"
              options={acciones.map((a) => ({ value: a, label: a }))}
            />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Usuario</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuario..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={handleSearch}>
              <Search className="w-4 h-4 mr-1" />
              Buscar
            </Button>
            <Button size="sm" variant="outline" onClick={handleFilterReset}>
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FileText className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-lg font-medium">Sin registros de auditoría</p>
              <p className="text-sm">No se encontraron registros con los filtros aplicados</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 pr-4 font-medium text-muted-foreground">Fecha/Hora</th>
                      <th className="pb-3 pr-4 font-medium text-muted-foreground">Usuario</th>
                      <th className="pb-3 pr-4 font-medium text-muted-foreground">Acción</th>
                      <th className="pb-3 pr-4 font-medium text-muted-foreground">Módulo</th>
                      <th className="pb-3 pr-4 font-medium text-muted-foreground">ID Entidad</th>
                      <th className="pb-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => {
                      const isExpanded = expandedRow === log.id;
                      const hasData = log.before_data || log.after_data;
                      return (
                        <React.Fragment key={log.id}>
                          <tr
                            className={`border-b hover:bg-muted/50 transition-colors ${hasData ? "cursor-pointer" : ""}`}
                            onClick={() => hasData && setExpandedRow(isExpanded ? null : log.id)}
                          >
                            <td className="py-3 pr-4 whitespace-nowrap text-xs">
                              {formatDateTime(log.created_at)}
                            </td>
                            <td className="py-3 pr-4 whitespace-nowrap">
                              {log.user_name || "-"}
                            </td>
                            <td className="py-3 pr-4">
                              <Badge
                                variant="outline"
                                className={ACTION_COLORS[log.action] || "bg-gray-100 text-gray-800 border-gray-200"}
                              >
                                {log.action}
                              </Badge>
                            </td>
                            <td className="py-3 pr-4 whitespace-nowrap">{log.module}</td>
                            <td className="py-3 pr-4 whitespace-nowrap text-xs text-muted-foreground">
                              {log.entity_id ? `#${log.entity_id.slice(0, 8)}` : "-"}
                            </td>
                            <td className="py-3">
                              {hasData && (
                                isExpanded
                                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              )}
                            </td>
                          </tr>
                          {isExpanded && hasData && (
                            <tr>
                              <td colSpan={6} className="bg-muted/30 px-4 py-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {log.before_data && (
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                                        Datos anteriores
                                      </p>
                                      <div className="text-xs bg-background rounded-lg p-3 overflow-auto max-h-64 border space-y-1">
                                        {Object.entries(typeof log.before_data === "string" ? JSON.parse(log.before_data) : log.before_data).map(([k, v]) => (
                                          <div key={k} className="flex gap-2">
                                            <span className="font-medium text-muted-foreground min-w-[120px]">{k}:</span>
                                            <span className="text-foreground">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {log.after_data && (
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                                        Datos posteriores
                                      </p>
                                      <div className="text-xs bg-background rounded-lg p-3 overflow-auto max-h-64 border space-y-1">
                                        {Object.entries(typeof log.after_data === "string" ? JSON.parse(log.after_data) : log.after_data).map(([k, v]) => (
                                          <div key={k} className="flex gap-2">
                                            <span className="font-medium text-muted-foreground min-w-[120px]">{k}:</span>
                                            <span className="text-foreground">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Página {page + 1} de {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
