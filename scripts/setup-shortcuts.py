import os
import winreg

target = r"E:\tikz-editor-master\tikz-editor-master\start.bat"
workdir = r"E:\tikz-editor-master\tikz-editor-master"

# 1. Registry App Paths
for exe in ["tikz.exe", "tikz-circuit.exe", "tikz-editor.exe"]:
    key_path = rf"Software\Microsoft\Windows\CurrentVersion\App Paths\{exe}"
    key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
    winreg.SetValueEx(key, "", 0, winreg.REG_SZ, target)
    winreg.CloseKey(key)

# 2. LocalAppData WindowsApps
localapp = os.environ.get("LOCALAPPDATA")
if localapp:
    apps_dir = os.path.join(localapp, "Microsoft", "WindowsApps")
    if os.path.exists(apps_dir):
        for name in ["tikz.bat", "tikz-circuit.bat", "tikz-editor.bat", "tikz editor.bat"]:
            p = os.path.join(apps_dir, name)
            with open(p, "w", encoding="utf-8") as f:
                f.write(f'@echo off\nstart "" /d "{workdir}" "{target}"\n')

# 3. Userprofile bin
userprofile = os.environ.get("USERPROFILE")
if userprofile:
    bin_dir = os.path.join(userprofile, "bin")
    if os.path.exists(bin_dir):
        for name in ["tikz.bat", "tikz-circuit.bat", "tikz-editor.bat", "tikz editor.bat"]:
            p = os.path.join(bin_dir, name)
            with open(p, "w", encoding="utf-8") as f:
                f.write(f'@echo off\nstart "" /d "{workdir}" "{target}"\n')

print("All registration completed cleanly!")
