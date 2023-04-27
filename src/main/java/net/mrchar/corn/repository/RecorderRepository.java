package net.mrchar.corn.repository;

import net.mrchar.corn.model.Recorder;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

import java.util.UUID;

@RepositoryRestResource(path = "recorders")
public interface RecorderRepository extends CrudRepository<Recorder, Long> {
}
