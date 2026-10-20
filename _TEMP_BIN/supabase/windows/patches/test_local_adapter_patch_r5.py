"""R5 offline fake-session PID regression; no database or network."""
from __future__ import annotations
import multiprocessing as mp
import os, time, unittest
from tests.fake_adapter import _fake_pid_active

class TestLocalPidProbe(unittest.TestCase):
    def test_current_process_active(self):
        self.assertTrue(_fake_pid_active(os.getpid()))

    @unittest.skipUnless(os.name == 'nt', 'Windows-only live process-handle test')
    def test_dead_child_handle_open_but_process_inactive(self):
        ctx=mp.get_context('spawn')
        child=ctx.Process(target=time.sleep,args=(2,))
        child.start()
        try:
            self.assertTrue(_fake_pid_active(child.pid))
        finally:
            child.terminate()
            child.join(10)
        self.assertIsNotNone(child.exitcode)
        # Parent retains the Process handle here. This caught original Windows false positive.
        self.assertFalse(_fake_pid_active(child.pid))

if __name__=='__main__':unittest.main()
