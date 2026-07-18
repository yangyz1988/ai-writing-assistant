# 截图当前屏幕并保存到桌面
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# 截取整个屏幕
 = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height)
 = [System.Drawing.Graphics]::FromImage()
.CopyFromScreen([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Location, [System.Drawing.Point]::Empty, .Size)
.Dispose()

# 保存截图
.Save('C:\Users\37196\Desktop\chrome-extensions-page.png')
.Dispose()

Write-Host '截图已保存到桌面: chrome-extensions-page.png'
Write-Host '请查看这个截图，看看按钮在哪里'
