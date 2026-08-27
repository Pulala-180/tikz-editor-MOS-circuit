param(
    [string]$InitialDir = "",
    [string]$InitialDirBase64 = "",
    [string]$Title = "选择草稿工作区文件夹"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

if ($InitialDirBase64) {
    try {
        $bytes = [Convert]::FromBase64String($InitialDirBase64)
        $InitialDir = [System.Text.Encoding]::UTF8.GetString($bytes)
    } catch {}
}

$code = @'
using System;
using System.Runtime.InteropServices;

public class NativeFolderPicker {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
        IntPtr pbc,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        out IntPtr ppv);

    [ComImport]
    [Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    [CoClass(typeof(FileOpenDialogRCW))]
    public interface NativeFileOpenDialog : IFileOpenDialog {}

    [ComImport]
    [Guid("d57c7288-d4ad-4768-be02-9d969532d960")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IFileOpenDialog {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        void SetFileTypeIndex(uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise(IntPtr pfde, out uint pdwCookie);
        void Unadvise(uint dwCookie);
        void SetOptions(uint fos);
        void GetOptions(out uint fos);
        void SetDefaultFolder(IntPtr psi);
        void SetFolder(IntPtr psi);
        void GetFolder(out IntPtr ppsi);
        void GetCurrentSelection(out IntPtr ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace(IntPtr psi, int fdap);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        void Close(int hr);
        void SetClientGuid([In, MarshalAs(UnmanagedType.LPStruct)] Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr pFilter);
        void GetResults(out IntPtr ppenum);
        void GetSelectedItems(out IntPtr ppsai);
    }

    [ComImport]
    [Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IShellItem {
        void BindToHandler(IntPtr pbc, [In, MarshalAs(UnmanagedType.LPStruct)] Guid bhid, [In, MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    [ComImport]
    [Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    [ClassInterface(ClassInterfaceType.None)]
    private class FileOpenDialogRCW {}

    public static string PickFolder(string initialFolder, string title) {
        var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
        uint options;
        dialog.GetOptions(out options);
        // FOS_PICKFOLDERS (0x20) | FOS_FORCEFILESYSTEM (0x40)
        dialog.SetOptions(options | 0x00000020 | 0x00000040);
        if (!string.IsNullOrEmpty(title)) {
            dialog.SetTitle(title);
        }
        dialog.SetOkButtonLabel("选择文件夹");
        dialog.SetFileNameLabel("文件夹:");
        if (!string.IsNullOrEmpty(initialFolder) && System.IO.Directory.Exists(initialFolder)) {
            IntPtr item;
            Guid guid = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
            if (SHCreateItemFromParsingName(initialFolder, IntPtr.Zero, guid, out item) == 0 && item != IntPtr.Zero) {
                dialog.SetFolder(item);
            }
        }
        if (dialog.Show(IntPtr.Zero) == 0) {
            IShellItem result;
            dialog.GetResult(out result);
            string path;
            result.GetDisplayName(0x80058000, out path); // SIGDN_FILESYSPATH
            return path;
        }
        return null;
    }
}
'@

try {
    Add-Type -TypeDefinition $code -Language CSharp
    $res = [NativeFolderPicker]::PickFolder($InitialDir, $Title)
    if ($res) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($res)
        $b64 = [Convert]::ToBase64String($bytes)
        [Console]::WriteLine("BASE64:" + $b64)
    }
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    $fbd = New-Object System.Windows.Forms.FolderBrowserDialog
    $fbd.Description = $Title
    $fbd.SelectedPath = $InitialDir
    $fbd.ShowNewFolderButton = $true
    if ($fbd.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($fbd.SelectedPath)
        $b64 = [Convert]::ToBase64String($bytes)
        [Console]::WriteLine("BASE64:" + $b64)
    }
}
