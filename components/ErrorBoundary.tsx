import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
                    <div className="bg-red-900/10 p-4 rounded-full mb-4">
                        <AlertCircle className="w-12 h-12 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Qualcosa è andato storto</h1>
                    <p className="text-gray-400 mb-6 max-w-md">
                        Si è verificato un errore imprevisto. Prova a ricaricare la pagina.
                    </p>
                    <div className="bg-black/50 p-4 rounded-lg text-left w-full max-w-2xl overflow-auto border border-red-900/30">
                        <p className="text-red-400 font-mono text-sm mb-2 font-bold">
                            {this.state.error?.name}: {this.state.error?.message}
                        </p>
                        {this.state.error?.stack && (
                            <pre className="text-gray-500 text-xs whitespace-pre-wrap">
                                {this.state.error.stack}
                            </pre>
                        )}
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-8 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium"
                    >
                        Ricarica Pagina
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
