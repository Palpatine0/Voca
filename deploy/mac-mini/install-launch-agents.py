#!/usr/bin/env python3
"""Install this user's Voca startup, keep-awake, and daily backup agents."""
import os
from pathlib import Path
import plistlib
import subprocess
import sys

if sys.platform != 'darwin':
    raise SystemExit('Run this on the Mac mini.')
root = Path(__file__).resolve().parent
if not (root / '.env').is_file():
    raise SystemExit('Configure .env before installing launch agents.')
agents = Path.home() / 'Library/LaunchAgents'
agents.mkdir(parents=True, exist_ok=True)
logs = root / 'secrets/logs'
logs.mkdir(parents=True, exist_ok=True, mode=0o700)
domain = f'gui/{os.getuid()}'
subprocess.run(['launchctl', 'print', domain], stdout=subprocess.DEVNULL, check=True)
jobs = {
    'startup': {'ProgramArguments': ['/bin/sh', str(root / 'startup.sh')], 'RunAtLoad': True},
    'keep-awake': {'ProgramArguments': ['/usr/bin/caffeinate', '-is'], 'KeepAlive': True, 'RunAtLoad': True},
    'backup': {'ProgramArguments': ['/bin/sh', str(root / 'backup.sh')], 'StartCalendarInterval': {'Hour': 4, 'Minute': 0}},
}
for name, settings in jobs.items():
    label = f'in.sethmccarthy.voca.{name}'
    target = agents / f'{label}.plist'
    settings.update(Label=label, WorkingDirectory=str(root),
                    StandardOutPath=str(logs / f'{name}.log'),
                    StandardErrorPath=str(logs / f'{name}.error.log'), Umask=0o077)
    subprocess.run(['launchctl', 'bootout', f'{domain}/{label}'],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    with target.open('wb') as handle:
        plistlib.dump(settings, handle)
    target.chmod(0o600)
    subprocess.run(['launchctl', 'bootstrap', domain, str(target)], check=True)
    print(f'Installed {label}')
print('Backups run at 04:00 in the mini\'s local time. A login is required after reboot.')
