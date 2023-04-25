package net.mrchar.corn.repository;

import net.mrchar.corn.model.Recorder;
import org.springframework.data.repository.CrudRepository;

import java.util.UUID;


public interface RecorderRepository extends CrudRepository<Recorder, UUID> {
}
