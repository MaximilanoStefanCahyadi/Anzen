import React, { useEffect, useState } from "react";
import { ref, onValue, query, limitToLast } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface AccessLog {
  id: string;
  timestamp: string;
  name?: string;
  snapshot?: string;
  method?: string;
  status?: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logLimit, setLogLimit] = useState(20);

  useEffect(() => {
    if (!rtdb) {
      setError("Firebase Realtime Database is not initialized.");
      setLoading(false);
      return;
    }

    const logsRef = ref(rtdb, "logs");
    const recentLogsQuery = query(logsRef, limitToLast(logLimit));

    const unsubscribe = onValue(recentLogsQuery, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Convert object to array and reverse to show newest first
        const logsList = Object.entries(data).map(([key, value]: [string, any]) => ({
          id: key,
          ...value,
        })).reverse();
        setLogs(logsList);
        setError(null);
      } else {
        setLogs([]);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error fetching logs:", err);
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [logLimit]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4 text-red-500">
        <p className="text-lg font-semibold">Error loading logs</p>
        <p className="text-sm">{error}</p>
        <p className="text-xs text-zinc-500">Check your Firebase Realtime Database Rules.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Access Logs</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {/* Desktop Table View */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Image</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-zinc-500">
                      No logs found.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {log.timestamp || "N/A"}
                      </TableCell>
                      <TableCell>
                        {(!log.name || log.name.toLowerCase() === "unknown") ? (
                          <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-1 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-600/20">
                            UNKNOWN
                          </span>
                        ) : (
                          <span className="font-medium text-zinc-900 whitespace-nowrap">{log.name}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{log.method || "Face ID"}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                            log.status === "Success" || log.status === "Granted" || !log.status // Default to success if undefined
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {log.status || "Granted"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {log.snapshot ? (
                          <img
                            src={log.snapshot}
                            alt="Snapshot"
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <span className="text-xs text-zinc-400">No Image</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile List View */}
          <div className="sm:hidden flex flex-col divide-y divide-zinc-100">
            {logs.length === 0 ? (
              <div className="p-4 text-center text-zinc-500 text-sm">
                No logs found.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-center gap-4 p-4">
                  {/* Image */}
                  <div className="flex-shrink-0">
                    {log.snapshot ? (
                      <img
                        src={log.snapshot}
                        alt="Snapshot"
                        className="h-12 w-12 rounded object-cover border"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-zinc-100 flex items-center justify-center text-xs text-zinc-400 text-center">
                        No Img
                      </div>
                    )}
                  </div>
                  
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      {(!log.name || log.name.toLowerCase() === "unknown") ? (
                        <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-inset ring-red-600/20">
                          UNKNOWN
                        </span>
                      ) : (
                        <span className="font-medium text-sm text-zinc-900 truncate block">
                          {log.name}
                        </span>
                      )}
                      
                      <span
                        className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          log.status === "Success" || log.status === "Granted" || !log.status
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {log.status || "Granted"}
                      </span>
                    </div>
                    
                    <p className="text-xs text-zinc-500 truncate">
                      {log.timestamp || "N/A"}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      {log.method || "Face ID"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Load More Button */}
          {logs.length === logLimit && (
            <div className="flex justify-center p-4 pt-6 border-t border-zinc-100 dark:border-zinc-800">
              <Button 
                variant="outline" 
                onClick={() => setLogLimit(prev => prev + 20)}
                className="w-full sm:w-auto"
              >
                Load More Logs
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
