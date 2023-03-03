(awk '{print $0; system("sleep 1");}' scripts/pset5/test"$1".txt) | nc 45.77.3.115 18018
