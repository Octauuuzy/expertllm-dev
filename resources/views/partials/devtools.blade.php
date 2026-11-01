    <div id="customContextMenu" class="custom-context-menu">
        <div class="ctx-item" onclick="window.openPayloadViewer()">
            <span class="ctx-label">View Payload</span>
            <span class="ctx-shortcut">Latest LLM</span>
            <i class="fas fa-file-code ctx-icon"></i>
        </div>
        <div class="ctx-item" onclick="window.toggleCustomConsole()">
            <span class="ctx-label">Open Console</span>
            <span class="ctx-shortcut">Ctrl+Shift+Q</span>
            <i class="fas fa-terminal ctx-icon"></i>
        </div>
    </div>

    <!-- Custom Console Window -->
    <div id="customConsole" class="custom-console-window">
        <div class="console-header" id="consoleHeader">
            <span class="console-title">Browser Console</span>
            <div class="console-controls">
                <i class="fas fa-eraser" onclick="window.clearCustomConsole()" title="Clear Output"></i>
                <i class="fas fa-times" onclick="window.toggleCustomConsole()" title="Close"
                    style="margin-left:12px;"></i>
            </div>
        </div>
        <div class="console-body" id="consoleBody"></div>
    </div>

    <!-- LLM Payload Viewer -->
    <div id="payloadViewer" class="custom-payload-window">
        <div class="console-header" id="payloadViewerHeader">
            <span class="console-title">LLM Payload Viewer</span>
            <div class="console-controls">
                <i class="fas fa-copy" onclick="window.copyPayloadViewer()" title="Copy Payload"></i>
                <i class="fas fa-rotate-right" onclick="window.refreshPayloadViewer()" title="Refresh"></i>
                <i class="fas fa-times" onclick="window.togglePayloadViewer()" title="Close"
                    style="margin-left:12px;"></i>
            </div>
        </div>
        <pre class="payload-viewer-body" id="payloadViewerBody"></pre>
    </div>

